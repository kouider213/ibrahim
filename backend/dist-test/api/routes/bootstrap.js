"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("../../integrations/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// Tables Dzaryx à créer
const TABLES = [
    {
        name: 'tasks',
        sql: `CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL, description TEXT, action_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 5, created_by TEXT NOT NULL DEFAULT 'Dzaryx',
      result JSONB, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )`,
    },
    {
        name: 'task_runs',
        sql: `CREATE TABLE IF NOT EXISTS task_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ, log TEXT, output JSONB
    )`,
    },
    {
        name: 'validations',
        sql: `CREATE TABLE IF NOT EXISTS validations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID, type TEXT NOT NULL, context JSONB NOT NULL DEFAULT '{}',
      proposed JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending', decision_by TEXT,
      decision_at TIMESTAMPTZ, note TEXT,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
    {
        name: 'notifications',
        sql: `CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL, channel TEXT NOT NULL, title TEXT NOT NULL,
      message TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
      payload JSONB DEFAULT '{}', sent_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
    {
        name: 'conversations',
        sql: `CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      audio_url TEXT, metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
    {
        name: 'user_preferences',
        sql: `CREATE TABLE IF NOT EXISTS user_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE, value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
    {
        name: 'audit_logs',
        sql: `CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor TEXT NOT NULL DEFAULT 'Dzaryx', action TEXT NOT NULL,
      target TEXT, target_id UUID, before JSONB, after JSONB,
      ip TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
    {
        name: 'Dzaryx_rules',
        sql: `CREATE TABLE IF NOT EXISTS Dzaryx_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category TEXT NOT NULL, rule TEXT NOT NULL,
      conditions JSONB DEFAULT '{}', action JSONB DEFAULT '{}',
      confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      source TEXT NOT NULL DEFAULT 'manual',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
    {
        name: 'integrations',
        sql: `CREATE TABLE IF NOT EXISTS integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      last_sync TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    },
];
// GET /api/bootstrap/status — check table existence
router.get('/status', auth_js_1.requireMobileAuth, async (_req, res) => {
    const results = {};
    for (const t of TABLES) {
        const { error } = await supabase_js_1.supabase.from(t.name).select('id').limit(1);
        results[t.name] = !error || !error.message.includes('schema cache');
    }
    const allReady = Object.values(results).every(Boolean);
    res.json({ allReady, tables: results });
});
// GET /api/bootstrap/sql — return the SQL to execute manually
router.get('/sql', auth_js_1.requireMobileAuth, (_req, res) => {
    try {
        const sqlPath = path_1.default.resolve(__dirname, '../../../../supabase/schema-Dzaryx-only.sql');
        const sql = (0, fs_1.readFileSync)(sqlPath, 'utf-8');
        res.type('text/plain').send(sql);
    }
    catch {
        res.json({ sqls: TABLES.map(t => t.sql) });
    }
});
exports.default = router;
//# sourceMappingURL=bootstrap.js.map