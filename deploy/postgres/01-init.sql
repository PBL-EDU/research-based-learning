-- 初始化脚本：只在数据卷为空时执行一次（首次 up）。
-- 之后修改本文件不会自动生效；要重跑得删卷（会丢数据），或用 psql 手动执行。
--
-- 需要的扩展依据架构文档：
--   pg_trgm  门户搜索（§2.3「PG pg_trgm + 关键词」）
--   citext   邮箱 / handle 大小写不敏感唯一约束

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- 会话级默认值。数据库名用 current_database() 取，避免写死 rlc（万一 .env 改了库名）
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L',
                   current_database(), 'Asia/Shanghai');
    -- 防止某个卡住的事务一直占着连接不放，把连接池耗尽
    EXECUTE format('ALTER DATABASE %I SET idle_in_transaction_session_timeout TO %L',
                   current_database(), '60s');
END
$$;

-- 自检：扩展装上了没有
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(e, ', ') INTO missing
    FROM unnest(ARRAY['pg_trgm', 'citext']) AS e
    WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = e);

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '扩展缺失: %', missing;
    END IF;
END
$$;
