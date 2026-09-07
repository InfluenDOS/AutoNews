const GITHUB_API_VERSION = '2022-11-28'
const DEFAULT_REPO = 'InfluenDOS/AutoNews'

const workflows = {
  crawl: {
    file: 'crawl.yml',
    minimumIntervalMs: 55 * 60 * 1000,
  },
  expand: {
    file: 'expand-keywords.yml',
    minimumIntervalMs: 8 * 60 * 1000,
  },
} as const

type WorkflowKind = keyof typeof workflows

type GitHubRun = {
  created_at?: string
  status?: string
  html_url?: string
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isWorkflowKind(value: unknown): value is WorkflowKind {
  return value === 'crawl' || value === 'expand'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const authorization = req.headers.get('Authorization')?.trim()
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return json({ error: 'unauthorized' }, 401)
  }

  const token = Deno.env.get('GITHUB_TOKEN')?.trim()
  if (!token) {
    return json({ error: 'missing_github_token' }, 500)
  }

  const body = await req.json().catch(() => ({}))
  const kind = body?.workflow
  if (!isWorkflowKind(kind)) {
    return json({ error: 'workflow_must_be_crawl_or_expand' }, 400)
  }

  const config = workflows[kind]
  const repo = (Deno.env.get('GITHUB_REPO') || DEFAULT_REPO).trim()
  const workflowUrl = `https://api.github.com/repos/${repo}/actions/workflows/${config.file}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }

  try {
    const runsResponse = await fetch(`${workflowUrl}/runs?branch=main&per_page=10`, { headers })
    if (!runsResponse.ok) {
      return json({ error: 'github_runs_lookup_failed', status: runsResponse.status }, 502)
    }

    const payload = await runsResponse.json() as { workflow_runs?: GitHubRun[] }
    const runs = payload.workflow_runs || []
    const active = runs.find((run) => run.status === 'queued' || run.status === 'in_progress')
    if (active) {
      return json({ ok: true, triggered: false, reason: 'already_active', run_url: active.html_url })
    }

    const latest = runs[0]
    const latestCreatedAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0
    if (latestCreatedAt && Date.now() - latestCreatedAt < config.minimumIntervalMs) {
      return json({
        ok: true,
        triggered: false,
        reason: 'recent_run_exists',
        run_url: latest.html_url,
      })
    }

    const dispatchResponse = await fetch(`${workflowUrl}/dispatches`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    })
    if (!dispatchResponse.ok) {
      return json({ error: 'github_dispatch_failed', status: dispatchResponse.status }, 502)
    }

    return json({ ok: true, triggered: true, workflow: kind })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: 'unexpected_error', detail: message.slice(0, 200) }, 500)
  }
})
