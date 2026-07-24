import assert from "node:assert/strict";
import test from "node:test";
import { fileNameFromPath, inferKindFromPath } from "../src/lib/document-path.ts";

test("classifies supported document kinds case-insensitively", () => {
  assert.equal(inferKindFromPath("records/visit.PDF"), "pdf");
  assert.equal(inferKindFromPath("photos/rash.JpEg"), "image");
  assert.equal(inferKindFromPath("photos/scan.heic?download=1"), "image");
  assert.equal(inferKindFromPath("notes/summary.txt"), "other");
  assert.equal(inferKindFromPath("notes/no-extension"), "other");
});

test("uses the final path segment rather than dots in directories", () => {
  assert.equal(inferKindFromPath("patient.v2/document"), "other");
  assert.equal(inferKindFromPath("patient.v2/document.pdf#page=1"), "pdf");
});

test("removes generated timestamp prefixes and decodes display names", () => {
  assert.equal(fileNameFromPath("user/1721000000000-lab%20result.pdf"), "lab result.pdf");
  assert.equal(fileNameFromPath("user/plain-name.png?token=redacted"), "plain-name.png");
});

test("preserves malformed encoded names without throwing", () => {
  assert.equal(fileNameFromPath("user/1721000000000-bad%ZZname.pdf"), "bad%ZZname.pdf");
});
