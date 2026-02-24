# VoxSight Demo Video Script

Total duration: ~3 minutes 30 seconds

---

## Opening (0:00 - 0:30)

**Screen**: VoxSight logo + extension icon

**Voiceover**:
"285 million people worldwide are visually impaired. The web is built for eyes -- but it doesn't have to be. VoxSight is a Chrome extension that turns voice commands into web actions, powered by Gemini's multimodal vision. You speak, Gemini sees the page, and VoxSight does the rest."

**Action**: Show Chrome with VoxSight side panel open. Press Alt+V to toggle it.

---

## Scene 1: Page Description (0:30 - 1:15)

**Screen**: Open google.com

**Voiceover**: "Let's start simple. I'll ask VoxSight to describe what it sees."

**Action**:
1. Hold microphone button (or press Space)
2. Say: "Describe this page"
3. VoxSight captures a screenshot, sends it to Gemini
4. Show the processing indicator ("Analyzing...")
5. Gemini responds with a description: "This is the Google homepage. I can see the Google logo, a search input field in the center, and two buttons: 'Google Search' and 'I'm Feeling Lucky'."
6. VoxSight speaks the description aloud

**Key points to show**:
- Real-time screenshot capture
- Gemini's visual understanding of page layout
- Text-to-speech output
- Side panel conversation history

---

## Scene 2: Voice Navigation (1:15 - 2:15)

**Screen**: Still on google.com

**Voiceover**: "Now let's search for something."

**Action**:
1. Say: "Search for accessible web design"
2. VoxSight identifies the search box, shows highlight overlay
3. Types "accessible web design" into the search field
4. Presses Enter
5. Page loads search results
6. VoxSight automatically describes: "Search results loaded. I can see 10 results about accessible web design..."

7. Say: "Click the first result"
8. VoxSight highlights the first result link
9. Clicks it
10. New page loads
11. VoxSight describes the new page content

**Key points to show**:
- Multi-step action chain (type + press Enter)
- Visual highlight overlay on action targets
- Post-action verification (screenshot after each action)
- Continuous context awareness

---

## Scene 3: Form Filling (2:15 - 3:00)

**Screen**: Open a demo form page (e.g., httpbin.org/forms/post or a simple HTML form)

**Voiceover**: "VoxSight can also fill out forms with voice commands."

**Action**:
1. Say: "Fill in the name field with John Smith"
2. VoxSight identifies the name input, types "John Smith"
3. Shows confirmation of the action

4. Say: "Scroll down"
5. Page scrolls smoothly

6. Say: "Click the submit button"
7. VoxSight detects this is a high-risk action
8. Shows confirmation dialog: "This is a high-risk action: click 'Submit'. Do you want to continue?"
9. Say: "Yes" to confirm
10. Form submits

**Key points to show**:
- Precise coordinate mapping (screenshot space -> CSS space)
- High-risk action confirmation (submit, pay, delete)
- Voice confirmation flow
- Bilingual capability (switch to Chinese if desired)

---

## Architecture & Accessibility (3:00 - 3:20)

**Screen**: Show architecture diagram from docs/architecture.md

**Voiceover**:
"Under the hood, VoxSight uses Gemini's Live API for bidirectional streaming -- this isn't turn-based, it's a continuous conversation. The Chrome extension captures screenshots, the Cloud Run backend manages sessions, and Gemini's multimodal vision analyzes every frame."

**Action**: Quick cuts showing:
- Architecture diagram
- Cloud Run console
- High contrast mode toggle
- Font size cycling (A+ -> A++ -> A)
- Language switch (English -> Chinese)

---

## Closing (3:20 - 3:30)

**Screen**: VoxSight logo + GitHub URL

**Voiceover**:
"VoxSight: making the web accessible through voice and vision. Built with Gemini Live API, deployed on Google Cloud Run."

**Action**: Show GitHub repo URL and Devpost submission link.

---

## Recording Notes

- Record on macOS Chrome with a clean profile
- Resolution: 1920x1080
- Ensure microphone input is visible in the recording
- Show the side panel conversation scrolling in real-time
- Keep Chrome DevTools closed during recording
- Test all scenes before recording to ensure smooth flow
