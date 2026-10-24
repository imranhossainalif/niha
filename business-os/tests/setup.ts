// DB tests run only against TEST_DATABASE_URL (a throwaway database), never the real DATABASE_URL.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;

process.env.INBOX_QUERY_EXPAND = 'off'; // tests mock the AI call by call; keyword expansion has its own test
