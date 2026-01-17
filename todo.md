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


## Cerințe Noi - Round 6

### UI Improvements
- [x] Sortare campaigns/adsets/ads alfabetic A-Z by default
- [x] Auto-arrange text la paste în Body textarea
- [x] Hook textarea 50% mai mic (55px)
- [x] Nume Adset = nume imagine (nu "Adset 1"), cu label "Adset N:" în stânga

### Bug Fixes
- [x] Fix eroare "Invalid parameter" - adăugat mai mulți parametri din originalAdSet
- [ ] Fix persistență token Facebook la refresh (necesită investigare suplimentară)

### New Features
- [x] Progress logs live la Create cu progress bar și dialog


## Cerințe Noi - Round 7

### Persistență Date
- [x] Implementare localStorage pentru a nu pierde datele la refresh
- [x] Salvare: token Facebook, ad account selectat, campaign/adset/ad selectat, nr adsets, ads per adset, show inactive toggles

### Bug Fixes
- [x] Fix eroare "Invalid parameter" la creare creative - adăugat call_to_action.value.link
- [x] Adăugat logging detaliat pentru debugging


## Cerințe Noi - Round 8

### Grupare Vizuală Imagini
- [x] Grupare imagini cu același nume dar aspect ratio diferit (4x5, 9x16) într-un singur grup vizual
- [x] Afișare aspect ratio corect în header-ul grupului
- [x] UI pentru a vedea clar grupările (card-uri cu numele și aspect ratio-urile)
- [x] Sub fiecare imagine se afișează numele fișierului (nu aspect ratio)

### Fix Eroare 413 Payload Too Large
- [x] Comprimare imagini înainte de upload (max 1200px, quality 85%)
- [x] Warning pentru video-uri mari (>50MB)

### Rate Limiting Meta API
- [x] Implementare rate limiting - pauză de 2s între Ad Sets
- [x] Afișare progres și pauze în logs
- [x] Meta API Limits: ~200 calls/hour pentru Standard tier, ~5000 pentru Dev tier


## Bug Fix - Round 9

### localStorage Fix
- [x] Fix: Datele se salvează acum la refresh
- [x] Adăugat salvare media pool în localStorage (cu limită 4MB)
- [x] Fix auto-connect Facebook din localStorage când nu există token în DB
- [x] Toate selecțiile (campaign, adset, ad, ad account) se salvează și se restaurează


## Bug Fix - Round 10

### Aspect Ratio Detection
- [ ] Fix: Aspect ratio afișează 1x1 în loc de 4x5 sau 9x16
- [ ] Verificare logica de detectare aspect ratio din numele fișierului

### Show Paused Checkbox
- [ ] Fix: Checkbox-ul "show paused" nu se păstrează la refresh

### Invalid Parameter Error
- [ ] Fix: Eroare "Invalid parameter" la creare creative
- [ ] Investigare parametri lipsă pentru Meta API creative


## Cerințe Noi - Round 11

### Aspect Ratio Detection din Dimensiuni
- [x] Detectare aspect ratio din dimensiunile reale ale imaginii (width/height)
- [x] 4x5 = ratio ~0.8, 9x16 = ratio ~0.5625, 1x1 = ratio 1.0, 16x9 = ratio ~1.78

### Bunny.net Storage Integration
- [x] Integrare Bunny.net pentru salvare imagini (în loc de localStorage)
- [x] Structură foldere: meta-ads-uploader/username/year/month/day/filename-timestamp.ext
- [x] Upload imagini la Bunny.net când se adaugă în media pool
- [x] localStorage salvează doar CDN URLs (nu base64)


## Cerințe Noi - Round 12

### UI Improvements
- [x] Redus lățimea site-ului cu 25% (de la 1280px la 960px)

### Debugging
- [x] Adăugat logging complet și detaliat pentru createSingleAd (upload imagine, creare creative, creare ad)


## Bug Fix URGENT - Round 13

### Ad Accounts Issue
- [x] Fix: Adăugat buton "Disconnect" pentru a putea reconecta Facebook
- [x] Adăugat logging detaliat pentru debugging Ad Accounts query
- [x] Afișare toast error când Ad Accounts nu se încarcă

### UI Width Issue
- [x] Lățimea site-ului e setată la 960px în cod (trebuie Publish pentru a se aplica pe live)


## Bug Fix - Round 14

#### Upload Media Bug
- [x] Fix: "No media was uploaded" - imaginea se descarcă de pe CDN și se convertește la base64
- [x] Investigare de ce media nu ajunge la Meta API - era din cauza că CDN URL nu avea base64

### UI Fixes
- [x] Fix: Lățimea site-ului fixă la 960px (max-width aplicat global)
- [x] Salvare search text în localStorage pentru campaigns/adsets/ads
- [ ] Scroll automat la item-ul selectat în liste (TODO)

### localStorage Persistence
- [x] Salvare Step 3 Preview în localStorage (adsets, ads, texte, schedule)
- [x] Salvare showPreview state

### Warnings
- [ ] Fix: Warning Missing Description for DialogContent (TODO)


## Bug Fix - Round 15

### UI Bugs
- [x] Fix: Lățime fixă 960px - redenumit clasa din .container în .app-container pentru a evita conflictul cu Tailwind CSS 4
- [x] Fix: Scroll automat la item selectat - adăugat refs și useEffect pentru campaigns, adSets, ads
- [ ] Fix: Warning Missing Description for DialogContent


## Bug Fix - Round 16

### UI Changes
- [x] Iconița Google Drive - mică în stânga sus, cu culorile oficiale (galben, albastru, verde, roșu)
- [x] Zona de drag & drop - full width (fără butonul Google Drive separat)

### Meta API Fix
- [x] Adăugat log-uri detaliate la FIECARE pas din batchCreateAds:
  - STEP 0: Start - template ID, ad set name, nr ads
  - STEP 1: Get template ad info - page ID, account ID
  - STEP 2: Get original ad set data
  - STEP 3: Create new ad set
  - STEP 4.x: Pentru fiecare ad:
    - 4a: Upload images - filename, base64 length, hash
    - 4b: Upload videos - filename, video ID
    - 4c: Verify media - list all uploaded
    - 4d: Create creative - all params
    - 4e: Create ad - all params
  - STEP 5: Final summary - success/failed count
- [x] Creat pagină Privacy Policy pentru Meta App Review (/privacy-policy)
- [ ] Fix eroare "Invalid parameter" - aplicația Facebook trebuie trecută din Development Mode în Live Mode


## Google Drive Integration - Round 17

- [x] Configurare ENV cu Google credentials (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY, GOOGLE_CLIENT_SECRET)
- [x] Implementare Google Picker pentru selectare fișiere din Drive
- [x] Download fișiere selectate și adăugare în media pool
- [ ] Salvare Google token în DB pentru auto-reconnect (opțional - tokenul se păstrează în sesiune)


## Naming Rules & UI - Round 18

### Naming Rules
- [x] Adset name - fără "_4x5", "_9x16", "4x5", "9x16" la sfârșit (trim)
- [x] Ad name pentru imagini - adăugă "_HOOK1", "_HOOK2" etc la sfârșit
- [x] Adset Name Composer - câmp nou în Step 3 cu variabila $IMAGE-NAME
- [x] Ad name pentru video - exact numele fișierului, fără hook append

### UI Changes
- [x] Iconița Google Drive - mutată deasupra border-ului dashed
- [x] Text "Import from Google Drive" lângă iconiță


## UI Improvements - Round 19

- [x] Micșorare padding/margin la Card-uri (Step 1-6) - sub titlu și deasupra
- [x] Buton "Create All" → "PUBLISH ALL" - mare, triplu înălțime, centrat pe pagină, gradient albastru-mov


## Facebook Token Long-Lived - Round 20

- [x] Implementare exchange token short-lived → long-lived (60 zile)
- [x] Salvare token long-lived în DB
- [x] Auto-refresh la login
- [x] Frontend actualizează token-ul cu versiunea long-lived


## Stream Direct Upload + UI Step 2 - Round 21

### Backend
- [x] Endpoint upload direct pe Meta pentru imagini (returnează hash)
- [x] Endpoint upload direct pe Meta pentru video (returnează video_id)
- [x] Endpoint upload din Google Drive direct pe Meta (server-side)
- [x] Păstrează funcțiile Bunny ca backup

### Frontend
- [x] Extragere thumbnail local pentru video (primul frame)
- [x] UI Step 2 - progress bar per fișier
- [x] UI Step 2 - buton "UPLOAD TO META"
- [x] Step 3+ apar doar după upload complet
- [x] Buton "Retry Failed" pentru fișiere eșuate
- [x] Thumbnail vizibil în toate step-urile (2, 3, 4, 5)
- [x] Status indicator per grup (success/error/uploading)


## Bug Fix - Round 22

- [x] Google Drive - salvare token în DB cu expirare 60 zile
- [x] Dezactivare upload Bunny CDN - doar upload direct pe Meta
- [x] Token Google se salvează în DB și se refolosește la următorul import


## UI Improvements Step 2 - Round 23

- [x] Link "Remove All" în Step 2 pentru a șterge toate fișierele
- [x] Google Drive - suport pentru Shared Drives
- [x] Google Drive - salvează ultimul folder vizitat și deschide direct acolo
- [x] Sortare fișiere alfabetic cu natural sort (HOOK1 < HOOK2 < HOOK10)


## Google Drive Server-to-Server - Round 24

- [x] Frontend - Google Drive salvează doar ID-ul fișierului (fără descărcare)
- [x] Backend - endpoint upload Google Drive → Meta (server-to-server) - exista deja
- [x] Frontend - handleUploadToMeta detectează fișiere Google Drive și le trimite la server
- [x] Thumbnail de la Google Drive API pentru preview


## Google Drive UI - Round 25

- [x] Shared Drives ca tab principal în Google Picker (primul view)
- [x] Fix thumbnail-uri video - obține thumbnail real via Google Drive API (nu iconita generică)
- [x] Google Picker - List view ca default (nu Grid)


## Bug Fix - Round 26

- [ ] Google OAuth - Authorization Code flow cu refresh token (60 zile)
- [x] Fix aspect ratio pentru video - detectare din Google Drive metadata (videoMediaMetadata)
- [x] Fix upload video pe Meta - adăugat logging detaliat pentru a vedea eroarea exactă


## Bug Fix - Round 22

- [ ] Google Drive - salvare token în sesiune pentru a evita re-login la fiecare import
- [ ] Dezactivare upload Bunny CDN - doar upload direct pe Meta


## Bug Fix - Round 27

### Google OAuth
- [x] Implementare Authorization Code flow cu refresh token pentru 60 zile persistență
- [x] Frontend folosește initCodeClient în loc de initTokenClient
- [x] Backend exchangeCode endpoint salvează refresh_token în DB
- [x] Backend getToken face refresh automat când token-ul expiră

### Video Aspect Ratio
- [x] Detectare aspect ratio din dimensiunile reale ale video-ului (videoWidth/videoHeight)
- [x] extractVideoThumbnail returnează acum și width/height
- [x] Fallback la detectare din filename dacă dimensiunile nu sunt disponibile

### Google Drive Thumbnails
- [x] Fix afișare thumbnail-uri pentru fișiere Google Drive
- [x] Folosire googleDriveThumbnail în toate locurile de afișare
- [x] Obținere thumbnail din Google Drive API metadata (thumbnailLink)
- [x] Logging îmbunătățit pentru debugging thumbnail-uri


### Video Upload Fix
- [x] Fix upload video la Meta - folosește metaVideoId pre-uploadat în loc să re-uploadeze
- [x] Actualizat schema batchCreateAds să accepte metaHash și metaVideoId opționale
- [x] Backend verifică dacă există metaHash/metaVideoId înainte să încerce upload
- [x] Frontend trimite metaHash și metaVideoId la batchCreateAds


## Bug Fix - Round 28

### Video Upload Fix
- [x] Fix: Frontend trimitea `videoBase64` dar backend aștepta `base64Data` - corectat
- [x] Adăugat verificare dacă base64 există înainte de upload video local
- [x] Adăugat timeout 5 minute pentru download Google Drive și 10 minute pentru upload Meta
- [x] Logging îmbunătățit cu timestamps și durate pentru debugging

### Aspect Ratio Detection
- [x] Adăugat mai multe pattern-uri pentru detectare din filename (vertical, story, reel, feed, etc.)
- [x] Default la 9x16 pentru video-uri fără aspect ratio detectat (cel mai comun pentru ads)


## Bug Fix - Round 29

### Upload Video via file_url (Major Fix)
- [x] Implementat metoda file_url pentru upload video de pe Google Drive la Meta
- [x] Serverul nu mai descarcă video-ul în memorie - Meta îl descarcă direct
- [x] Adăugat permisiune publică temporară la fișier (automat prin API)
- [x] Șterge permisiunea publică după upload (cleanup automat)
- [x] Fișierele rămân private în Google Drive - doar temporar publice pentru upload



## Bug Fix - Round 30

### Video Upload via Bunny (Large Files)
- [x] Implement direct browser-to-Bunny upload for large videos (>50MB)
- [x] Meta receives file_url from Bunny CDN
- [x] Video 112MB uploaded successfully

### UI Improvements
- [x] Video thumbnail display 9x16 (vertical) instead of square
- [x] Hide AdName Composer when only videos in media pool
- [x] Auto-generate AdSet Name from video pattern (T4_C1_E1_AD2_HOOK1_EVA_1 → T4_C1_E1_AD2_EVA_1_HOOK1-3)


## Bug Fix - Round 31

### Video Display Issues
- [x] Fix: Video thumbnail afișat 16x9 în loc de 9x16 la Step 4
- [x] Fix: Eroare 413 la publish video - folosește metaVideoId în loc de base64


## Bug Fix - Round 32

### Video Creative Thumbnail
- [ ] Fix: Meta API cere image_hash sau image_url pentru video creative thumbnail



## Bug Fixes - Round 17

### Step 4 Video Preview
- [x] Video player muted by default - add controls bar with play/pause/volume
- [x] URL field not pre-filled when selecting video template ad

### Logging
- [x] Fix misleading log "Uploading media and creating ads" - should be "Creating ads" since upload is done in Step 2

### Video Ad Creation
- [x] Fix image_hash error for video ads - use Meta's auto-generated thumbnail URL (image_url) instead of requiring separate image upload

## UI Improvements - Round 18

### Bunny CDN Upload Progress
- [x] Add visible progress bar for Bunny CDN upload (large video files)
- [x] Show upload percentage during browser-to-Bunny transfer
- [x] Make uploads parallel (all videos upload simultaneously)
- [x] Show individual progress bar for each media item in UI

## Bug Fixes - Round 19

### Meta Ad Settings
- [x] Disable Advantage+ creative enhancements by default (degrees_of_freedom_spec with OPT_OUT)
- [x] Disable Multi-advertiser ads by default (contextual_multi_ads with OPT_OUT)

### Video Thumbnails
- [x] Fix grey thumbnails - now waits for video processing before fetching thumbnail (polling up to 60s)

## Feature - Round 20: Hardcoded Ad Settings

### Requirements (always hardcoded, not copied from template)
- [x] Advantage+ creative enhancements - ALWAYS OFF
- [x] Multi-advertiser ads - ALWAYS OFF
- [x] Call to action - ALWAYS LEARN_MORE (already hardcoded)
- [x] Instagram account - ALWAYS "Use Facebook Page" (automatic - we don't send instagram_actor_id)


## UI/UX Improvements - Round 22

### Step 4 Layout
- [ ] Make URL and Headline inputs same width as video preview and Primary Text textarea

### Upload Progress
- [ ] Make Bunny upload progress bar REAL (not artificial) using XMLHttpRequest progress events

### Processing Indicators
- [ ] Add "Processing video at Meta..." indicator when waiting for thumbnail

### Error Handling
- [ ] Add auto-retry for ads that fail (max 2-3 retries, then stop with error)


## UI/UX Improvements - Round 22

### Step 4 Input Widths
- [x] Make URL and Headline inputs same width as video/textarea (100% width)

### Upload Progress Indicator
- [x] Add indicator "Uploading X%" when progress < 50%
- [x] Add indicator "Processing at Meta..." when progress >= 50%

### Auto-Retry for Failed Ads
- [x] Add auto-retry for failed ads (max 2 attempts)
- [x] 3 second delay between retry attempts
- [x] Log retry attempts in console

### Meta API Fixes
- [x] Remove deprecated degrees_of_freedom_spec (standard_enhancements no longer supported)
- [x] Keep only contextual_multi_ads for disabling Multi-advertiser ads


## Bug Fixes - Round 23

### Step 4 Input Widths
- [x] Fix Headline and URL inputs to be same width as video/textarea (full width)

### Advantage+ Creative Enhancements
- [ ] Disable Visual touch-ups (image_touchups) - Meta API deprecated degrees_of_freedom_spec
- [ ] Disable Add video effects (cv_transformation?) - Meta API deprecated degrees_of_freedom_spec
- [ ] Disable Enhance CTA (enhance_cta) - Meta API deprecated degrees_of_freedom_spec
- NOTE: Meta has deprecated degrees_of_freedom_spec and no longer accepts these settings via API

### Template Copy
- [x] Fix headline not copying from template ad - now uses adDetailsQuery.data.headline


## Feature - Round 24: Copy degrees_of_freedom_spec from Template

### Goal
- [ ] Copy degrees_of_freedom_spec from template ad and apply to new ads
- [ ] This should preserve Advantage+ creative enhancements settings from template

### Implementation
- [ ] Add degreesOfFreedomSpec to batchCreateAds input schema
- [ ] Pass degreesOfFreedomSpec from frontend when creating ads
- [ ] Apply degreesOfFreedomSpec when creating creative


## Feature - Round 25: Disable All Advantage+ Creative Enhancements

### Goal
- Disable all Advantage+ creative enhancements when creating new ads
- Use correct structure: degrees_of_freedom_spec.creative_features_spec

### Tasks
- [x] Add degrees_of_freedom_spec with all features OPT_OUT to video creative (batchCreateAds)
- [x] Add degrees_of_freedom_spec with all features OPT_OUT to image creative (batchCreateAds)
- [x] Add degrees_of_freedom_spec with all features OPT_OUT to createAd (multiple images)
- [x] Add degrees_of_freedom_spec with all features OPT_OUT to createAd (single image)


## Feature - Round 26: Public Links Import from Google Drive

### Goal
- Add "#3 Public Links" button to import files from Google Drive using direct links
- User pastes multiple Google Drive links (comma or newline separated)
- Server downloads files from Google Drive and uploads to Bunny CDN (server-to-server)

### Tasks
- [x] Add backend endpoint `google.downloadPublicFiles` to download files from Google Drive by file ID
- [x] Backend extracts file IDs from various Google Drive URL formats
- [x] Backend downloads files using Google Drive API with API key
- [x] Backend uploads files to Bunny CDN using `uploadBufferToBunny`
- [x] Add "#3 Public Links" button in Step 2 (blue color, next to #2 Public Folder)
- [x] Add dialog with textarea for pasting links (auto-arranges comma-separated to newlines)
- [x] Show link count and download progress
- [x] Add downloaded files to media pool with Bunny CDN URLs
- [x] Write vitest tests for the new endpoint (6 tests passing)


## Feature - Round 27: Bunny Fetch (Direct URL Import)

### Goal
- Add "#4 Bunny Fetch" button that uses Bunny Stream's videos/fetch endpoint
- Server only sends Google Drive URL to Bunny - no bytes proxied through our server
- More efficient and cheaper - Bunny downloads directly from source

### Tasks
- [x] Add Bunny Stream API credentials to bunnyStorage.ts (env vars: BUNNY_STREAM_API_KEY, BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_CDN_HOSTNAME)
- [x] Add backend endpoint `google.bunnyFetchFiles` that calls Bunny's videos/fetch API
- [x] Backend extracts file IDs and constructs Google Drive download URLs (`/uc?export=download&id=FILE_ID`)
- [x] Backend sends URLs to Bunny Stream fetch endpoint
- [x] Add `bunnyStreamFetchVideo`, `bunnyStreamWaitForVideo`, `bunnyStreamGetVideoStatus` helper functions
- [x] Add "#4 Bunny Fetch" button in Step 2 (purple color)
- [x] Add dialog with textarea for pasting links (auto-arranges comma-separated to newlines)
- [x] Poll Bunny for video status until ready (waitForProcessing option)
- [x] Add completed videos to media pool with directPlayUrl and thumbnailUrl
- [x] Write vitest tests for the new endpoint (7 tests passing)


## Bug Fix - Round 28

- [x] Fix: #4 Bunny Fetch error "n[u] is not a function" (minified: "hooks[lastArg] is not a function")
  - Changed from direct `.mutate()` call to using `useMutation` hook with `.mutateAsync()`
  - Added `downloadPublicFilesMutation` and `bunnyFetchFilesMutation` hooks
  - Also fixed #3 Public Links to use the same pattern


## Bug Fix - Round 29

- [ ] Fix: #4 Bunny Fetch - video name shows random GUID instead of original filename from Google Drive

- [ ] Fix: #4 Bunny Fetch - Upload to Meta fails silently (0 uploaded, 1 failed, no logs)


## Feature/Bug Fixes - Round 30

- [ ] #1: Add FB Page selector dropdown in Step 4 (fetch from connected Facebook pages)
- [ ] #2: Fix input lag/delay issue when pasting/deleting text in inputs
- [ ] #3: Fix date format for schedule - change from "2026-01-18 00:05" to "18 January 2026, 00:05 AM"
- [ ] #4: Fix schedule functionality in both locations in Step 4
- [ ] #5: Add Presets system for URL/Headline/FB Page with database storage


## Feature/Bug Fixes - Round 30 (COMPLETED)

### Tasks
- [x] FB Page selector - Add dropdown to select Facebook Pages in Step 4
  - Added `meta.getPages` endpoint to fetch user's Facebook pages
  - Added dropdown in Step 4 with all connected pages
  - Pass selected pageId to batchCreateAds mutation
- [x] Input lag - Fix slow paste/delete in inputs (use useTransition)
  - Added `startTransition` wrapper for updateAdSet and updateAd functions
  - React now prioritizes user input over re-renders
- [x] Date format - Change schedule display from "2026-01-18 00:05" to "18 January 2026, 00:05 AM"
  - Updated formatScheduleDate function to use toLocaleDateString with long format
- [x] Schedule fix - Ensure schedule works
  - Added `start_time` parameter to ad set creation (ISO 8601 format)
  - Changed status to ACTIVE (not PAUSED) when schedule is enabled
  - Both ad set and ads are now set to ACTIVE for scheduled publishing
- [x] Presets system - Add presets for URL/Headline/FB Page saved in database
  - Created `ad_presets` table in database
  - Added `presets.getAll`, `presets.create`, `presets.update`, `presets.delete` endpoints
  - Added Presets dropdown in Step 4 under FB Page selector
  - Added "+ New" button to create preset from current values
  - Added delete button for selected preset
  - Selecting a preset auto-fills Headline, URL, and FB Page
