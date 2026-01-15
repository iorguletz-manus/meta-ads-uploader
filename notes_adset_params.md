# Meta API - Ad Set Required Parameters

Based on official documentation:

## Required Parameters for Creating Ad Set:
1. `name` - Name of the ad set
2. `optimization_goal` - e.g., REACH, LINK_CLICKS, PAGE_LIKES
3. `billing_event` - e.g., IMPRESSIONS, LINK_CLICKS
4. `campaign_id` - ID of the campaign
5. `targeting` - Targeting specifications (geo_locations, platforms, etc.)

## Optional but commonly needed:
- `bid_amount` - Bid cap in cents
- `daily_budget` or `lifetime_budget` - Budget in account currency
- `status` - ACTIVE, PAUSED, DELETED, ARCHIVED
- `start_time` / `end_time` - For scheduled campaigns
- `promoted_object` - Object being promoted (page_id, app_id, etc.)

## Example curl:
```bash
curl -X POST \
  -F 'name="My Reach Ad Set"' \
  -F 'optimization_goal="REACH"' \
  -F 'billing_event="IMPRESSIONS"' \
  -F 'bid_amount=2' \
  -F 'daily_budget=1000' \
  -F 'campaign_id="<AD_CAMPAIGN_ID>"' \
  -F 'targeting={
       "geo_locations": {
         "countries": ["US"]
       },
       "facebook_positions": ["feed"]
     }' \
  -F 'status="PAUSED"' \
  -F 'promoted_object={"page_id": "<PAGE_ID>"}' \
  -F 'access_token=<ACCESS_TOKEN>' \
  https://graph.facebook.com/v24.0/act_<AD_ACCOUNT_ID>/adsets
```

## Issue Analysis:
The current code copies targeting from original ad set but may be missing required fields or sending invalid values.

Possible issues:
1. `targeting` might be empty or invalid
2. `promoted_object` might be required for certain optimization goals
3. `bid_amount` might be required for certain billing events
