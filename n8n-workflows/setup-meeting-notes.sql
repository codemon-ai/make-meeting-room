-- PostgreSQL 테이블 생성
-- 서버에서 실행: psql -U postgres -d your_database -f setup-meeting-notes.sql

CREATE TABLE IF NOT EXISTS meeting_notes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    meeting_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_meeting_notes_date ON meeting_notes(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_created ON meeting_notes(created_at);

-- 텍스트 검색을 위한 GIN 인덱스 (선택사항)
CREATE INDEX IF NOT EXISTS idx_meeting_notes_content_gin ON meeting_notes USING gin(to_tsvector('simple', content));
