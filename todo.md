# Meta Ads Uploader - TODO

## Core Features
- [x] Facebook Login OAuth integration for secure authentication
- [x] Dropdown to select Campaign from connected Facebook account
- [x] Dropdown to select Ad Set from selected Campaign
- [x] Dropdown to select Ad (template) from selected Ad Set
- [x] Editable text field for new duplicated Ad Set name
- [x] Drag and drop zone for uploading images with thumbnail previews
- [x] Automatic grouping of images by filename prefix (e.g., shoes_9x16.jpg + shoes_4x5.jpg)
- [x] For each image group: editable fields for Ad Name, Primary Text, Headline, URL
- [x] Pre-fill fields from template Ad
- [x] Individual 'Create Ad' button for each image group
- [x] Global 'Create All Ads' button to process all groups in batch
- [x] Status indicators: ✅ Created / ⏳ Creating / ❌ Error with message

## Backend API
- [ ] Store Facebook access token securely
- [x] Endpoint to list Campaigns from Meta API
- [x] Endpoint to list Ad Sets from selected Campaign
- [x] Endpoint to list Ads from selected Ad Set
- [x] Endpoint to get Ad details (for pre-filling template)
- [x] Endpoint to upload images to Meta Ad Account
- [x] Endpoint to duplicate Ad Set
- [x] Endpoint to create Ad Creative with images
- [x] Endpoint to create Ad in duplicated Ad Set

## UI/UX
- [x] Clean one-pager layout with all fields visible
- [x] Responsive design for desktop use
- [x] Loading states for API calls
- [x] Error handling and display
- [x] Success feedback after ad creation

## Issues Found & Fixes Needed
- [ ] Fix: createFullAd creates new Ad Set for EACH ad instead of ONE Ad Set with multiple ads
- [ ] Fix: Need to track if Ad Set was already duplicated to reuse it for subsequent ads
- [ ] Fix: Add Ad Account selector (user may have multiple ad accounts)
- [ ] Fix: Handle placement-specific images (9x16 for Stories, 4x5 for Feed) in creative

- [x] Replace Manus OAuth with simple username/password login (iorguletz/cinema10)
- [x] Remove registration option - single fixed account only
