# The Tell - Backend API

FastAPI backend for AI-powered corporate intelligence platform.

## Architecture

```
backend/
├── app/
│   ├── api/v1/              # API endpoints
│   │   ├── signals.py       # Signal CRUD operations
│   │   ├── companies.py     # Company CRUD operations
│   │   ├── analyses.py      # Analysis retrieval
│   │   └── articles.py      # Article generation
│   ├── analysis/            # Signal analysis pipeline
│   │   ├── pipeline.py      # Main analysis orchestrator
│   │   ├── fact_extraction.py
│   │   ├── sentiment.py
│   │   ├── themes.py
│   │   └── confidence.py
│   ├── articles/            # Article generation
│   │   ├── generator.py     # LLM-based article creation
│   │   └── templates.py     # Article formatting
│   ├── llm/                 # LLM abstraction layer
│   │   ├── provider.py      # OpenAI/Anthropic providers
│   │   ├── prompts.py       # Prompt templates
│   │   └── models.py        # LLM data models
│   ├── models/              # Pydantic models
│   │   └── schemas.py       # Domain entities
│   ├── scraping/            # Web scraping
│   │   ├── base.py          # Base scraper with rate limiting
│   │   ├── news_scraper.py  # News article parser
│   │   └── cache.py         # TTL cache
│   ├── config.py            # Configuration management
│   └── main.py              # FastAPI application
├── tests/                   # Test suite
├── .env.example             # Environment template
└── pyproject.toml           # Dependencies
```

## Features

### Phase 4: FastAPI Backend ✓
- FastAPI application with CORS middleware
- Configuration management via Pydantic Settings
- Health check endpoint
- API v1 router structure
- Structured logging with structlog

### Phase 5: News Scraper ✓
- Async HTTP client with httpx
- Rate limiting (configurable requests/second)
- Exponential backoff retry logic
- robots.txt compliance
- In-memory TTL cache
- HTML parsing with BeautifulSoup
- Metadata extraction (OpenGraph, Schema.org)
- URL normalization for deduplication

### Phase 6: LLM Abstraction Layer ✓
- Provider-agnostic interface (Protocol)
- OpenAI provider (GPT-4, GPT-3.5)
- Anthropic provider (Claude 3.5 Sonnet)
- Structured output parsing
- Prompt templates for all analysis tasks
- Token usage tracking

### Phase 7: Analysis Pipeline ✓
- Fact extraction with categorization
- Sentiment classification (POSITIVE/NEGATIVE/NEUTRAL)
- Strategic theme identification
- Composite confidence scoring
- End-to-end signal analysis

### Phase 8: Article Generation ✓
- LLM-powered article creation
- Markdown formatting
- Citation tracking
- Slug generation
- Executive summary generation

## Installation

### Prerequisites
- Python 3.13+
- pip

### Setup

1. **Create virtual environment** (if not already created):
```bash
python -m venv .venv
```

2. **Activate virtual environment**:
```bash
# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate
```

3. **Install dependencies**:
```bash
pip install -e backend[dev]
```

4. **Configure environment**:
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys
```

## Configuration

Edit `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/the_tell

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Scraping
SCRAPE_RATE_LIMIT=1.0
SCRAPE_TIMEOUT=30

# API
API_KEY=your-secret-key
FRONTEND_URL=http://localhost:3000

# Environment
ENVIRONMENT=development
LOG_LEVEL=INFO
```

## Running the Server

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### API Documentation

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## API Endpoints

### Health Check
```
GET /health
```

### Signals
```
GET    /api/v1/signals              # List signals
GET    /api/v1/signals/{id}         # Get signal
POST   /api/v1/signals              # Create signal
DELETE /api/v1/signals/{id}         # Delete signal
```

### Companies
```
GET    /api/v1/companies            # List companies
GET    /api/v1/companies/{id}       # Get company
POST   /api/v1/companies            # Create company
PATCH  /api/v1/companies/{id}       # Update company
DELETE /api/v1/companies/{id}       # Delete company
```

### Analyses
```
GET    /api/v1/analyses             # List analyses
GET    /api/v1/analyses/{id}        # Get analysis
```

### Articles
```
GET    /api/v1/articles             # List articles
GET    /api/v1/articles/{id}        # Get article
POST   /api/v1/articles             # Generate article
```

## Testing

Run all tests:
```bash
cd backend
pytest
```

Run with coverage:
```bash
pytest --cov=app --cov-report=term-missing
```

Run specific test file:
```bash
pytest tests/test_scraping.py
```

## Code Quality

### Formatting
```bash
black app/ tests/
```

### Linting
```bash
ruff check app/ tests/
ruff check --fix app/ tests/  # Auto-fix
```

### Type Checking
```bash
mypy app/
```

## Data Models

### Signal
A piece of public information about a company (news article, filing, transcript, etc.)

### Analysis
AI-generated insights from a signal:
- Key facts with categories
- Sentiment classification
- Strategic themes
- Confidence score

### Article
News-style article generated from multiple analyses:
- Headline
- Executive summary
- Markdown body with sections
- Source citations

## Development Status

All phases (4-8) are **COMPLETE** and functional:

- ✅ FastAPI backend with CORS and health endpoint
- ✅ Async news scraper with rate limiting and caching
- ✅ LLM abstraction layer (OpenAI + Anthropic)
- ✅ Analysis pipeline (facts, sentiment, themes, confidence)
- ✅ Article generation with markdown formatting
- ✅ Comprehensive test suite
- ✅ Type hints throughout
- ✅ Structured logging

## Next Steps

The backend is ready for:
1. Database integration (SQLAlchemy + PostgreSQL)
2. Authentication middleware
3. Background task processing (Celery/ARQ)
4. Real API endpoint implementations (currently stubs)
5. Integration with frontend

## License

Proprietary - The Tell Project
