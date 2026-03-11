# AI Auditor Rules: R3 Academia Compliance

## Technical Audit Criteria (HARD RULES)
1. **Message Separation**: Every distinct WhatsApp bubble MUST be separated by the literal tag `[[BALAO]]`.
2. **Plan Payments**: Registration/Monthly plans are EXCLUSIVELY via Credit Card. Any mention of PIX or Debit for plans is a **Critical Compliance Failure**.
3. **Link Triggering**: The registration link (https://evo-totem...) MUST only be sent after a clear, explicit intent to buy/enroll.
4. **Cancellation Logic**: 
   - Pre-purchase questions: Explain 90/30 day rule + ask plan preference. 
   - SAC/Cancel requests: Only for existing members. Must ask for reason and send SAC contact.
5. **Gympass/Totalpass**: Do NOT send registration links. Inform that access is allowed (TP1+ or Basic+).
6. **Tone & Style**: Messages must be short (1-3 sentences per bubble), friendly, and direct.

## Vision Analysis Protocol
- Focus on the central chat window.
- Identify the sender (Bot vs. Lead).
- Flag any deviation from the rules above as "DIVERGENT".

## Automatic Identification Protocol
1. **Source of Truth**: Ignore the filename for metadata. Use ONLY the visual information in the screenshot.
2. **Lead ID Extraction**: Look for the ID number in the CRM interface (e.g., strings starting with '#' like #2559).
3. **Lead Name Extraction**: Identify the Lead's name from the chat header or the bot's personalized greeting.
4. **Time Extraction**: For each message, extract the timestamp (HH:MM) shown next to the bubbles.
5. **Session Context**: If multiple leads appear, focus on the one in the active/central chat window.

## Message Separation Logic (Visual Verification)
1. **Technical Marker**: The tag `[[BALAO]]` is a back-end separator and will NOT be visible as text in screenshots.
2. **Visual Evidence**: The Auditor must verify if the bot's response was split into **multiple distinct blue bubbles**. 
3. **Validation**: 
   - If the bot sends plans (Basic and Premium), they MUST appear in separate bubbles.
   - If the bot sends a contextual phrase + a link, they MUST be in separate bubbles.
   - If all information is crammed into a single large bubble, mark as DIVERGENT (Missing separation).

   ## Reporting & Justification Standards
1. **Evidence-Based Feedback**: Every verdict (Approved/Divergent) must cite visual evidence.
   - *Example*: "Approved because at 14:38 the bot correctly split the Basic and Premium plans into separate visual bubbles."
2. **The "Positive & Negative" Balance**: 
   - For APPROVED: List at least 2 "Excellence Points" (e.g., Tone, Timing, Rule Compliance).
   - For DIVERGENT: Identify the "Root Cause" and the specific Hard Rule violated.
3. **Conversational Continuity**: Analyze if the bot maintains context between messages. If a lead asks a follow-up, did the bot address it or just reset?