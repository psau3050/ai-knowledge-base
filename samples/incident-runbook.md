# Incident Response Runbook

## Severity levels

- **SEV1**: the product is down or customer data is at risk. Page the on-call engineer immediately
  and open an incident channel named `#inc-<date>-<short-name>`.
- **SEV2**: a major feature is broken for many customers, with a workaround. Respond within 30 minutes.
- **SEV3**: a minor bug or degraded performance. Handle it during business hours.

## First 15 minutes

1. Acknowledge the page in PagerDuty so the escalation stops.
2. Appoint an incident commander. The commander coordinates and communicates; they do not debug.
3. Post a first status update on the status page within 15 minutes, even if the cause is unknown.
4. Check the deploy log: most incidents start within an hour of a deploy. Roll back first, investigate
   second.

## Escalation

If the on-call engineer has not acknowledged a SEV1 page within 10 minutes, it escalates to the
secondary on-call, then to the engineering manager after another 10 minutes. The database team is
paged directly for any incident involving replication lag above 60 seconds.

## After the incident

Every SEV1 and SEV2 gets a blameless postmortem within five working days. The postmortem lists the
timeline, the root cause, what went well, and action items with owners and due dates. Action items
are tracked in the reliability board until they are closed.
