# Contributing to HealthThread

HealthThread handles health-information workflows, so changes should remain small, reviewable, and explicit about what they do not prove.

## Before opening a pull request

```bash
npm ci
npm run validate
```

Do not commit `.env` files, private keys, service-role credentials, patient information, real medical documents, or screenshots containing identifiable health information.

## Testing expectations

- Put deterministic parsing, normalization, and policy logic in pure modules where possible.
- Add regression tests for the expected path and malformed or adversarial input.
- Do not replace a failing control with a weaker assertion merely to make CI green.
- Use synthetic fixtures only.
- Describe any database, authentication, or external-service assumptions in the pull request.

## Health and privacy boundary

A passing test or build does not establish clinical safety, medical accuracy, HIPAA compliance, or production readiness. Contributions must not present generated summaries as diagnoses, treatment recommendations, or physician authorization.

## Pull request evidence

Include:

1. the behavior changed
2. the risk or failure mode addressed
3. tests added or updated
4. privacy and credential impact
5. screenshots only when they contain synthetic data
