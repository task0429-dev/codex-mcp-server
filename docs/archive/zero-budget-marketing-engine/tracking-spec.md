# Zero Budget Marketing Engine - Tracking Spec

## Objective

Track demand generation activity without paid media by attributing traffic, leads, and follow-up outcomes across content, outreach, and partnerships.

## UTM Convention

- `utm_source`: channel origin such as `linkedin`, `x`, `newsletter`, `direct`, `community`, `partner`
- `utm_medium`: delivery type such as `organic-social`, `seo`, `email`, `referral`, `outreach`
- `utm_campaign`: campaign slug such as `zbme-week1-audit`, `zbme-lead-magnet-01`
- `utm_content`: optional content identifier for post or asset version

## Required Lead Metadata

- lead source
- CTA id
- landing page variant
- primary offer
- campaign tags
- captured timestamp

## CRM Tags

- `zbme_source`
- `zbme_medium`
- `zbme_campaign`
- `zbme_offer`
- `zbme_cta`
- `zbme_stage`

## Priority Events

- page view on marketing entry pages
- CTA click
- lead form submit
- lead magnet delivery
- welcome sequence start
- reply received
- call booked

## Reporting Requirements

- Daily new leads by channel
- CTA conversion by landing surface
- email welcome sequence starts
- replies and booked calls from outreach
- weekly channel winners and losers
