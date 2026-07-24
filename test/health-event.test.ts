import assert from "node:assert/strict";
import test from "node:test";
import { HEALTH_EVENT_TYPES, normalizeHealthEvent } from "../src/lib/health-event.ts";

const valid = {
  event_date: "2026-07-23",
  event_type: "Visit",
  title: " Annual physical ",
  description: " Reviewed preventive care. ",
  provider: " Dr. Patel ",
  location: " Oakland Clinic ",
  tags: "primary care, Follow-Up, primary CARE,  ",
};

test("normalizes a complete event before persistence", () => {
  assert.deepEqual(normalizeHealthEvent(valid), {
    event_date: "2026-07-23",
    event_type: "Visit",
    title: "Annual physical",
    description: "Reviewed preventive care.",
    provider: "Dr. Patel",
    location: "Oakland Clinic",
    tags: ["primary care", "Follow-Up"],
    memoryText: "2026-07-23 — Visit: Annual physical. Reviewed preventive care.",
  });
});

test("converts empty optional fields and tags to null", () => {
  const result = normalizeHealthEvent({
    event_date: "2024-02-29",
    event_type: "Lab result",
    title: "CBC",
    description: "   ",
    provider: "",
    location: " ",
    tags: [],
  });
  assert.equal(result.description, null);
  assert.equal(result.provider, null);
  assert.equal(result.location, null);
  assert.equal(result.tags, null);
  assert.equal(result.memoryText, "2024-02-29 — Lab result: CBC");
});

test("accepts every explicit event type", () => {
  for (const eventType of HEALTH_EVENT_TYPES) {
    assert.equal(
      normalizeHealthEvent({
        event_date: "2026-01-01",
        event_type: eventType,
        title: "Recorded event",
      }).event_type,
      eventType,
    );
  }
});

test("rejects malformed and impossible dates", () => {
  for (const eventDate of ["07/23/2026", "2026-2-03", "2026-02-30", "2025-02-29", ""]) {
    assert.throws(
      () => normalizeHealthEvent({ event_date: eventDate, event_type: "Visit", title: "Event" }),
      /event_date/,
    );
  }
});

test("rejects unsupported event types rather than widening the enum", () => {
  assert.throws(
    () =>
      normalizeHealthEvent({ event_date: "2026-07-23", event_type: "Diagnosis", title: "Event" }),
    /event_type is not supported/,
  );
});

test("requires a bounded title", () => {
  assert.throws(
    () => normalizeHealthEvent({ event_date: "2026-07-23", event_type: "Visit", title: "   " }),
    /title is required/,
  );
  assert.throws(
    () =>
      normalizeHealthEvent({
        event_date: "2026-07-23",
        event_type: "Visit",
        title: "x".repeat(161),
      }),
    /title exceeds 160/,
  );
});

test("enforces optional-field and tag bounds", () => {
  assert.throws(
    () => normalizeHealthEvent({ ...valid, description: "x".repeat(5_001) }),
    /description exceeds 5000/,
  );
  assert.throws(
    () => normalizeHealthEvent({ ...valid, provider: "x".repeat(161) }),
    /provider exceeds 160/,
  );
  assert.throws(
    () => normalizeHealthEvent({ ...valid, location: "x".repeat(161) }),
    /location exceeds 160/,
  );
  assert.throws(() => normalizeHealthEvent({ ...valid, tags: "x".repeat(41) }), /tag exceeds 40/);
  assert.throws(
    () =>
      normalizeHealthEvent({
        ...valid,
        tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
      }),
    /tags exceed 20/,
  );
});

test("does not add punctuation when no description is present", () => {
  const result = normalizeHealthEvent({
    event_date: "2026-07-23",
    event_type: "Medication",
    title: "Started medication",
  });
  assert.equal(result.memoryText, "2026-07-23 — Medication: Started medication");
});
