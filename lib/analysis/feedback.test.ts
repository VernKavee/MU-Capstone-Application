// Run with `npm run test:unit`. The feedback client against a local HTTP server standing in
// for the Python service: the request it sends, and the readable error for each way the
// service can fail. No service, no language model.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { FeedbackInput } from "./contracts.ts";
import { requestFeedback, writeFeedback } from "./feedback.ts";

const input: FeedbackInput = {
  profile: { display_name: "A", age: 30, gender: "female", weight_kg: 60, height_cm: 165, medical_history: "none" },
  exercise: { id: "squat", name: "Squat", rules: [] },
  workout: { target_reps: 5, target_sets: 3, rest_seconds: 60, earlier_sets: [] },
  set: { set_no: 1, kind: "initial", ended_by: "target_reached", totals: { attempts: 1, completed_reps: 1, correct_reps: 1, abandoned_attempts: 0 },
    similarity: null, feedback: null, attempts: [] },
  history: [],
};

async function serve(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => handler(req, body, res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feedback`;
  return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("feedback client: posts the input as JSON and returns only the feedback", async () => {
  let seen: { method?: string; type?: string; body?: unknown } = {};
  const s = await serve((req, body, res) => {
    seen = { method: req.method, type: req.headers["content-type"], body: JSON.parse(body) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ feedback: "Push your knees out.", version: { prompt: "v14" } }));
  });
  try {
    assert.deepEqual(await requestFeedback(s.url, input), { feedback: "Push your knees out." });
    assert.equal(seen.method, "POST");
    assert.equal(seen.type, "application/json");
    assert.deepEqual(seen.body, input);
  } finally {
    await s.close();
  }
});

test("feedback client: FEEDBACK_URL switches writeFeedback from the stub to the service", async () => {
  const s = await serve((_req, _body, res) => res.end(JSON.stringify({ feedback: "from the service" })));
  process.env.FEEDBACK_URL = s.url;
  try {
    assert.equal((await writeFeedback(input, 0)).feedback, "from the service");
  } finally {
    delete process.env.FEEDBACK_URL;
    await s.close();
  }
});

test("feedback client: a failure answer becomes the service's own sentence", async () => {
  const s = await serve((_req, _body, res) => {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("the language model is busy right now, try again in a minute");
  });
  try {
    await assert.rejects(requestFeedback(s.url, input),
      { message: "the feedback service answered 503: the language model is busy right now, try again in a minute" });
  } finally {
    await s.close();
  }
});

test("feedback client: an answer without feedback is an error", async () => {
  const s = await serve((_req, _body, res) => res.end(JSON.stringify({ feedback: "  " })));
  try {
    await assert.rejects(requestFeedback(s.url, input), { message: "the feedback service answered without feedback" });
  } finally {
    await s.close();
  }
});

test("feedback client: no answer in time", async () => {
  const s = await serve(() => {}); // never answers
  try {
    await assert.rejects(requestFeedback(s.url, input, 200), { message: "the feedback service did not answer within 0.2 s" });
  } finally {
    s.close(); // its socket is still open, so this does not wait
  }
});

test("feedback client: nothing listening", async () => {
  const s = await serve(() => {});
  await s.close();
  await assert.rejects(requestFeedback(s.url, input), { message: "the feedback service is not reachable" });
});
