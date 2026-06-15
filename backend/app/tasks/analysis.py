"""Background task for signal analysis pipeline."""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import async_session
from app.db.models import Signal, Analysis, Company

logger = structlog.get_logger()


async def process_signal_analysis(signal_id: str) -> None:
    """Process a signal through the analysis pipeline.
    
    This runs as a background task:
    1. Update signal status to ANALYZING
    2. Run scraping pipeline (if needed)
    3. Run LLM analysis
    4. Store results in Analysis table
    5. Update signal status to ANALYZED or FAILED
    """
    logger.info("Starting background analysis", signal_id=signal_id)
    
    async with async_session() as db:
        try:
            # Load signal with company
            query = (
                select(Signal)
                .options(selectinload(Signal.company))
                .where(Signal.id == signal_id)
            )
            result = await db.execute(query)
            signal = result.scalar_one_or_none()
            
            if not signal:
                logger.error("Signal not found", signal_id=signal_id)
                return
            
            # Update status to ANALYZING
            signal.status = "ANALYZING"
            await db.flush()
            
            # Import analysis pipeline
            from app.analysis.pipeline import analyze_signal
            from app.models.schemas import Signal as SignalSchema, Analysis as AnalysisSchema
            
            # Convert ORM model to Pydantic schema for analysis
            signal_schema = SignalSchema(
                id=signal.id,
                source_url=signal.sourceUrl,
                source_type=signal.sourceType,
                title=signal.title,
                raw_content=signal.rawContent,
                published_at=signal.publishedAt,
                scraped_at=signal.scrapedAt,
                company_id=signal.companyId,
                status=signal.status,
            )
            
            # Run analysis
            analysis_result: AnalysisSchema = await analyze_signal(signal_schema)
            
            # Store analysis in database
            analysis = Analysis(
                id=str(analysis_result.id),
                signalId=signal_id,
                summary=analysis_result.summary,
                keyFacts=[f.model_dump() for f in analysis_result.key_facts],
                sentiment=analysis_result.sentiment.value,
                strategicThemes=[t.model_dump() for t in analysis_result.strategic_themes],
                confidence=analysis_result.confidence,
                modelUsed=analysis_result.model_used,
                analyzedAt=analysis_result.analyzed_at,
            )
            
            db.add(analysis)
            
            # Update signal status to ANALYZED
            signal.status = "ANALYZED"
            await db.commit()
            
            logger.info(
                "Completed background analysis",
                signal_id=signal_id,
                analysis_id=analysis.id,
                confidence=round(analysis_result.confidence, 3),
            )
            
        except Exception as e:
            logger.exception("Background analysis failed", signal_id=signal_id, error=str(e))
            
            # Update signal status to FAILED
            try:
                query = select(Signal).where(Signal.id == signal_id)
                result = await db.execute(query)
                signal = result.scalar_one_or_none()
                if signal:
                    signal.status = "FAILED"
                    await db.commit()
            except Exception:
                logger.exception("Failed to update signal status to FAILED", signal_id=signal_id)
