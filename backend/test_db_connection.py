"""Test database connection and query Company table."""

import asyncio
from sqlalchemy import select
from app.db.session import async_session
from app.db.models import Company


async def test_connection():
    """Test database connection by querying Company table."""
    print("Testing database connection...")
    
    async with async_session() as session:
        result = await session.execute(select(Company).limit(3))
        companies = result.scalars().all()
        
        print(f"[OK] Connection successful! Found {len(companies)} companies:")
        for company in companies:
            print(f"   - {company.name} ({company.ticker})")
        
        return len(companies) > 0


if __name__ == "__main__":
    success = asyncio.run(test_connection())
    if not success:
        print("[FAIL] No companies found in database")
        exit(1)
