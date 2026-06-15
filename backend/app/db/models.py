"""SQLAlchemy ORM models matching Prisma schema."""

from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Text, DateTime, Float, JSON, Enum, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class SourceType(str, PyEnum):
    NEWS = "NEWS"
    FILING = "FILING"
    TRANSCRIPT = "TRANSCRIPT"
    SOCIAL = "SOCIAL"
    BLOG = "BLOG"
    JOB_POSTING = "JOB_POSTING"


class SignalStatus(str, PyEnum):
    PENDING = "PENDING"
    ANALYZING = "ANALYZING"
    ANALYZED = "ANALYZED"
    FAILED = "FAILED"


class Sentiment(str, PyEnum):
    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    NEUTRAL = "NEUTRAL"


class ArticleStatus(str, PyEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class Company(Base):
    __tablename__ = "Company"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    ticker = Column(String)
    description = Column(Text)
    websiteUrl = Column(String)
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    signals = relationship("Signal", back_populates="company", cascade="all, delete-orphan")
    articles = relationship("Article", back_populates="company", cascade="all, delete-orphan")


class Signal(Base):
    __tablename__ = "Signal"

    id = Column(String, primary_key=True)
    sourceUrl = Column(String, nullable=False)
    sourceType = Column(Enum(SourceType), nullable=False)
    title = Column(String, nullable=False)
    rawContent = Column(Text, nullable=False)
    publishedAt = Column(DateTime)
    scrapedAt = Column(DateTime, default=datetime.utcnow)
    companyId = Column(String, ForeignKey("Company.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(Enum(SignalStatus), default=SignalStatus.PENDING, index=True)
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="signals")
    analysis = relationship("Analysis", back_populates="signal", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_sourceType", "sourceType"),
        Index("idx_status", "status"),
        Index("idx_scrapedAt", "scrapedAt"),
    )


class Analysis(Base):
    __tablename__ = "Analysis"

    id = Column(String, primary_key=True)
    signalId = Column(String, ForeignKey("Signal.id", ondelete="CASCADE"), unique=True, nullable=False)
    summary = Column(Text, nullable=False)
    keyFacts = Column(JSON, nullable=False)
    sentiment = Column(Enum(Sentiment), nullable=False, index=True)
    strategicThemes = Column(JSON, nullable=False)
    confidence = Column(Float, nullable=False)
    modelUsed = Column(String, nullable=False)
    analyzedAt = Column(DateTime, default=datetime.utcnow, index=True)

    signal = relationship("Signal", back_populates="analysis")


class User(Base):
    __tablename__ = "User"

    id = Column(String, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    emailVerified = Column(DateTime)
    image = Column(String)
    passwordHash = Column(String)
    role = Column(String, default="USER")
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    articles = relationship("Article", back_populates="author")


class Article(Base):
    __tablename__ = "Article"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    summary = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    companyId = Column(String, ForeignKey("Company.id", ondelete="CASCADE"), nullable=False, index=True)
    analysisIds = Column(JSON, default=list)
    publishedAt = Column(DateTime, index=True)
    status = Column(Enum(ArticleStatus), default=ArticleStatus.DRAFT, index=True)
    authorId = Column(String, ForeignKey("User.id", ondelete="SET NULL"))
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="articles")
    author = relationship("User", back_populates="articles")
