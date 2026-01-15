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

## Improvements Round 2

### Upload Flow Verification
- [x] Verify image upload returns hash before creating creative
- [x] Implement proper video upload to Meta API (videos need different endpoint)
- [x] Video upload should return video_id for creative creation

### UI Simplification
- [x] Merge Upload Media zone with Pool into single component
- [x] Remove separate Upload Media card - Pool IS the upload zone
- [x] Drag & drop directly into Pool area

### Schedule Ads Feature
- [x] Add date/time picker for scheduling ads
- [x] Hardcode timezone to Europe/Bucharest
- [x] Pass scheduled_publish_time to Meta API when creating ads
- [x] Show scheduled time in Create button
- [x] Remove orange color from Pool icon - use consistent design

## UI Refactor - Select Template Ad

### Ad Account in Header
- [x] Move Ad Account selector from Step 1 to header (right side)
- [x] Show green indicator when Ad Account is selected
- [x] Keep Ad Account selection persistent while working

### 3-Column Layout for Template Selection
- [x] Replace dropdowns with 3-column scrollable layout
- [x] Column 1: Campaigns list (click to select)
- [x] Column 2: Ad Sets list (appears after campaign selection)
- [x] Column 3: Ads list with thumbnails on the left
- [x] Each column has its own scrollbar

### Show Inactive Toggles
- [x] Add "Show Inactive" checkbox for Campaigns column
- [x] Add "Show Inactive" checkbox for Ad Sets column
- [x] Add "Show Inactive" checkbox for Ads column
- [x] Filter items based on status when toggle is off

## Facebook Token Persistence
- [x] Add facebookAccessToken column to users table
- [x] Add facebookTokenExpiry column to track expiration
- [x] Create backend procedure to save Facebook token after OAuth
- [x] Create backend procedure to get saved Facebook token
- [x] Update frontend to check for saved token on load
- [x] Auto-connect Facebook if valid token exists in DB


## Major UI Restructure - 4 Steps Flow

### Step 1 - Select Template Ad
- [x] Keep current 3-column layout (unchanged)

### Step 2 - Upload Media (Images / Videos)
- [x] Rename to "Upload Media (Images / Videos)"
- [x] Drag & drop zone for images and videos

### Step 3 - Establish Nr of Adsets
- [x] Rename to "Establish Nr of Adsets"
- [x] Input for number of Ad Sets
- [x] Input for Ads per Ad Set
- [x] "Distribute" button that reveals Step 4

### Step 4 - Preview (hidden until Distribute is clicked)
- [x] Show only after clicking Distribute
- [x] One card per Ad Set (Adset 1, Adset 2, etc.)
- [x] Media preview on right side (images 200-300px, videos min 1280x720)

### Image Ads Card Layout
- [x] Adset Name: INPUT
- [x] For each ad: AD NAME (input) + HOOK (textarea 225px height)
- [x] Single BODY textarea (485px height) - shared for all ads
- [x] Single HEADLINE input - shared for all ads
- [x] Single URL input - shared for all ads
- [x] Combine HOOK + BODY into Primary Text when creating ad

### Video Ads Card Layout
- [x] AD NAME: INPUT
- [x] PRIMARY TEXT: TEXTAREA (100px height)
- [x] Single HEADLINE input - shared
- [x] Single URL input - shared

### Other Requirements
- [x] Do NOT copy primary text from template ad to inputs
- [x] Textarea should be resizable if content exceeds default height


## Google Drive Integration
- [ ] Add Google Drive OAuth connection
- [ ] Save Google Drive token to database (like Facebook token)
- [ ] Auto-connect Google Drive if valid token exists
- [ ] Add "Import from Google Drive" button in Upload Media step
- [ ] Google Drive Picker to select files
- [ ] Download selected files from Drive and add to pool
- [ ] Support images and videos from Drive


## UI Improvements - Round 3

### Step 1 - Template Selection Compact Design
- [x] Font mic pentru campaigns/adsets/ads (nu mai mult spațiu)
- [x] Eliminare status "Active" de sub fiecare item
- [x] Reducere padding/margin pentru items compacte
- [x] Adăugare search box pentru fiecare coloană (Campaigns, Ad Sets, Ads)
- [x] Scroll intern în fiecare container (să nu afecteze Step 2, 3, 4)

### Step 4 - Preview Improvements
- [x] Hook textarea la jumătate înălțime (112px în loc de 225px)
- [x] Textarea width similar cu Facebook (320px - pentru a vedea cum pică textul pe mobile)
- [x] Schedule global jos de tot pentru toate Ad Set-urile + per Ad Set individual
- [x] Ad Name întotdeauna cu LITERE MARI (uppercase)

### Bug Fixes
- [ ] Fix: "Invalid parameter" la creare Ad Set


## UI Improvements - Round 4

### Visual Improvements
- [x] PAUSED campaigns/adsets/ads afișate cu roșu pentru diferențiere
- [x] Body textarea dublu ca înălțime (400px în loc de 200px)

### Schedule Improvements
- [x] Schedule All precompletare automată cu 00:05 ziua următoare

### Text Formatting
- [x] Link "Arrange text" sub Body textarea
- [x] Funcție arrange text: 1 propoziție per linie cu spații între ele
- [x] Spațiu automat între Hook și Body când se unesc (linie goală)

### Bug Fixes
- [x] Fix: Facebook connection nu rămâne conectat la refresh (era deja implementat)
- [x] Fix: Ad Account selectat persistă acum în baza de date la nivel de user


## Bug Fix - Facebook Token Persistence

- [ ] Fix: Facebook token nu rămâne conectat la refresh (trebuie investigat de ce nu funcționează auto-reconnect)


## Bug Fix - Round 5

- [x] Ștergere cont facturi4 din baza de date (nu se folosește)
- [x] Fix scroll vertical în containere campaigns/adsets/ads (scrollbar vizibil mereu)
