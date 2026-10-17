import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import type { ClinicActor } from "../lib/auth/clinic-actor";
import { searchPatientDirectory } from "../lib/patient-directory";
import type { PatientSearchRow, PatientSort } from "../lib/patient-management";

const patient: PatientSearchRow = {
  id: "d5d06719-cf90-4d7e-bb53-862f5195f1c8", name: "أحمد علي",
  phone: "+201234567891", created_at: "2026-10-17T10:00:00Z",
};

function fixture(count: number, rows: PatientSearchRow[] = [patient], fail: "count" | "rows" | null = null) {
  const requests: { url: URL; method: string; headers: Headers }[] = [];
  let clientCreations = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://patient-directory-tests.invalid");
    requests.push({ url, method: request.method, headers: request.headers });
    if ((fail === "count" && request.method === "HEAD") || (fail === "rows" && request.method === "GET")) {
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ message: "Private DB failure" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    return new Response(request.method === "HEAD" ? null : JSON.stringify(rows), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${count}` },
    });
  };
  const db = createClient<Database, "clinic">("https://patient-directory-tests.invalid", "local-test-key", {
    db: { schema: "clinic" }, auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
  return {
    requests,
    get clientCreations() { return clientCreations; },
    async load(input: unknown = { query: "", page: 1 }, actor: ClinicActor | null = {
      clerkUserId: "user_directorydoctor", role: "doctor",
    }) {
      return searchPatientDirectory(actor, input, () => { clientCreations++; return db; });
    },
  };
}

test("default directory reads ten current patients with minimal fields and a separate exact count", async () => {
  const source = fixture(21);
  assert.deepEqual(await source.load(), {
    success: true, patients: [patient], count: 21, page: 1, pages: 3, pageSize: 10,
  });
  assert.deepEqual(source.requests.map(request => request.method), ["HEAD", "GET"]);
  for (const { url, headers } of source.requests) {
    assert.equal(url.pathname, "/rest/v1/patients");
    assert.equal(url.searchParams.get("select"), "id,name,phone,created_at");
    assert.equal(url.searchParams.get("deleted_at"), "is.null");
    assert.equal(headers.get("accept-profile"), "clinic");
    assert.equal(url.searchParams.has("name"), false);
    assert.equal(url.searchParams.has("phone"), false);
  }
  assert.equal(source.requests[0].headers.get("prefer"), "count=exact");
  assert.equal(source.requests[1].headers.get("prefer"), null);
  assert.equal(source.requests[0].url.searchParams.has("offset"), false);
  assert.equal(source.requests[1].url.searchParams.get("offset"), "0");
  assert.equal(source.requests[1].url.searchParams.get("limit"), "10");
});

test("directory clamps stale pages and keeps advertised pages beyond 1000 reachable", async () => {
  const stale = fixture(21);
  const result = await stale.load({ query: "", page: Number.MAX_SAFE_INTEGER });
  assert.ok(result.success);
  assert.equal(result.page, 3);
  assert.equal(stale.requests[1].url.searchParams.get("offset"), "20");
  assert.equal(stale.requests[1].url.searchParams.get("limit"), "1");

  const deep = fixture(10011);
  const deepResult = await deep.load({ query: "", page: 1002 });
  assert.ok(deepResult.success);
  assert.equal(deepResult.pages, 1002);
  assert.equal(deepResult.page, 1002);
  assert.equal(deep.requests[1].url.searchParams.get("offset"), "10010");

  const empty = fixture(0, []);
  assert.deepEqual(await empty.load({ query: " ", page: 500 }), {
    success: true, patients: [], count: 0, page: 1, pages: 1, pageSize: 10,
  });
  assert.equal(empty.requests.length, 1);
});

test("profile and name/phone filters use the same scope for counts and directory rows", async () => {
  const named = fixture(1);
  await named.load({ query: "أحمد علي", page: 1, profile: "named", pageSize: 25 });
  for (const { url } of named.requests) {
    assert.deepEqual(url.searchParams.getAll("name"), ["ilike.%أحمد علي%", "match.[^[:space:]]"]);
    assert.equal(url.searchParams.has("or"), false);
  }

  const unnamed = fixture(1);
  await unnamed.load({ query: "201234", page: 1, profile: "unnamed", pageSize: 50 });
  for (const { url } of unnamed.requests) {
    assert.equal(url.searchParams.get("phone"), "like.+201234%");
    assert.equal(url.searchParams.get("or"), '(name.is.null,name.not.match."[^[:space:]]")');
  }
});

test("all supported orders use stable ID ties and put null names last", async () => {
  const expectedOrders: Record<PatientSort, string> = {
    newest: "created_at.desc.nullslast,id.asc", oldest: "created_at.asc.nullslast,id.asc",
    name_asc: "name.asc.nullslast,id.asc", name_desc: "name.desc.nullslast,id.asc",
    phone_asc: "phone.asc.nullslast,id.asc", phone_desc: "phone.desc.nullslast,id.asc",
  };
  for (const sort of Object.keys(expectedOrders) as PatientSort[]) {
    const source = fixture(1);
    await source.load({ query: "", page: 1, sort });
    assert.equal(source.requests[1].url.searchParams.get("order"), expectedOrders[sort]);
  }
});

test("count and row failures never return a partial directory", async () => {
  const countFailure = fixture(21, [patient], "count");
  assert.deepEqual(await countFailure.load(), { success: false, error: "unknown" });
  assert.equal(countFailure.requests.length, 1);
  const rowsFailure = fixture(21, [patient], "rows");
  assert.deepEqual(await rowsFailure.load(), { success: false, error: "unknown" });
});

test("every lookup checks the current actor before validation or creating a service client", async () => {
  const source = fixture(1);
  assert.deepEqual(await source.load({ query: "" }, null), { success: false, error: "forbidden" });
  assert.equal(source.clientCreations, 0);
  assert.equal(source.requests.length, 0);
  const secretary: ClinicActor = { clerkUserId: "user_directorysecretary", role: "secretary" };
  assert.equal((await source.load({ query: "", page: 1 }, secretary)).success, true);
  assert.equal(source.requests.length, 2);
  assert.deepEqual(await source.load({ query: "", page: 1 }, null), { success: false, error: "forbidden" });
  assert.equal(source.clientCreations, 1);
  assert.equal(source.requests.length, 2);
});

test("malformed search, filters and ordering never reach the service client", async () => {
  const source = fixture(1);
  for (const input of [
    null, { query: "a,b" }, { query: "%" }, { query: "", sort: "name.desc,email.asc" },
    { query: "", profile: "all),deleted_at.not.is.null" }, { query: "", pageSize: 1000 },
  ]) {
    assert.deepEqual(await source.load(input), { success: false, error: "invalid_query" });
  }
  assert.equal(source.clientCreations, 0);
  assert.equal(source.requests.length, 0);
});
