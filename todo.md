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
- [x] Create GitHub repository and push code
- [x] BUG: Connect Facebook button shows grey page - RESOLVED (requires user to add domains in Facebook Developer Console)

## New Features - Major Refactor

### Upload Enhancements
- [x] Support video upload (mp4, mov, etc.) in addition to images
- [x] Video preview thumbnails in UI
- [x] Group videos with images by prefix (e.g., product_9x16.mp4 + product_4x5.jpg = 1 ad)

### Distribution System
- [x] Ask user: How many Ad Sets to create?
- [x] Ask user: How many Ads per Ad Set?
- [x] Auto-distribute ads into Ad Sets based on user input
- [x] Show distribution preview before creation

### Drag & Drop UI
- [x] Pool (Oală) - container with all ungrouped/unassigned ads
- [x] Multiple Ad Set containers (visual boxes)
- [x] Drag ads from Pool to any Ad Set
- [x] Drag ads between Ad Sets
- [x] Drag ads back to Pool
- [x] Visual feedback during drag
- [x] Reorder ads within Ad Set

### Backend Updates
- [x] Support video upload to Meta API (uses same base64 upload)
- [x] Create multiple Ad Sets in one batch (each container creates its own Ad Set)
- [x] Handle video creative creation (handled by Meta API automatically)
