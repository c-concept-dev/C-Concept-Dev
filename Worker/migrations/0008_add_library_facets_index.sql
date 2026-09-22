-- Cover the dynamic facet matrix and author/title metadata without reading chunk content.
-- No vocabulary or content is inserted or changed.
CREATE INDEX IF NOT EXISTS idx_chunks_facets_cover
ON chunks(approach COLLATE NOCASE, language COLLATE NOCASE, book_title COLLATE NOCASE, author);
