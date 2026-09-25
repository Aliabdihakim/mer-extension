# Chrome Web Store listing – Meritio

## Name
Meritio – CV anpassat till annonsen

## Summary (max 132 tecken)
Anpassa ditt CV till jobbannonsen med ett klick. Ändringar i din egen Word-fil, layouten rörs aldrig. Platsbanken och Indeed.

## Description (Swedish)
Meritio anpassar ditt CV till annonsen du tittar på – utan att du skriver om det.

Så funkar det:
1. Ladda upp ditt CV som Word-fil, en gång.
2. Öppna en annons på Platsbanken eller Indeed och klicka på Meritio-knappen.
3. Meritio listar annonsens krav och säger ärligt vilka som täcks, täcks delvis eller saknas – med beviset ur ditt CV.
4. Förslagen ligger som spårade ändringar i ditt eget dokument, med motiveringen bredvid. Acceptera, avvisa eller skriv själv.
5. Ladda ner som PDF eller Word. Klart att skicka.

Det Meritio aldrig gör:
• Hittar på erfarenheter, verktyg eller siffror. Saknas något får du en fråga – har du det, skriver Meritio raden i din stil. Har du det inte, händer ingenting.
• Ändrar din layout. Typsnitt, färger och spalter är exakt som förut.

Övrigt:
• Kommer ihåg dina svar till nästa annons.
• Alla nedladdade CV sparas under Mina CV.
• Svenska och engelska.
• Ditt CV lagras i EU. Radera allt när som helst.

Gratis i 7 dagar. Sedan 99 kr/mån eller 199 kr/3 mån.

## Description (English)
Meritio tailors your CV to the job ad you're reading – without rewriting it.

Upload your CV as a Word file once. Open an ad on Platsbanken or Indeed and click the Meritio button. Meritio lists the ad's requirements, tells you honestly which are covered, partly covered or missing, and puts its suggestions into your own document as tracked changes with the reasoning next to each one. Accept, reject or type your own. Download as PDF or Word.

Meritio never invents experience and never touches your layout. Missing something? You get a question, not a fabrication. Your CV is stored in the EU and can be deleted at any time.

## Source code (AGPL-3.0) – link to include at the end of the description
Källkod: https://github.com/Aliabdihakim/mer-extension (AGPL-3.0). Tillägget bygger på SuperDoc.

## Category
Productivity

## Language
Swedish (primary), English

## Privacy policy URL
https://www.meritiocv.se/integritet

## Single purpose (för granskningen)
Meritio anpassar användarens uppladdade CV till innehållet i den jobbannons användaren har öppen, och låter användaren granska och ladda ner resultatet.

## Permission justifications
- **sidePanel** – Meritio's main interface is a side panel that shows the match analysis for the ad the user is viewing.
- **storage** – Stores the user's login token and the in-progress review state for the current ad locally.
- **downloads** – Saves the finished CV (PDF or Word) to the user's computer when they click Download.
- **tabs** – Used only to find the active tab so the review can be opened on the ad the user is looking at, and to open the account page. No browsing history is read or stored.
- **identity** – Enables "Sign in with Google" through Chrome's OAuth flow.
- **Host permission arbetsformedlingen.se** – Reads the ad id from the Platsbanken page the user has open and shows the Meritio button there.
- **Host permission *.indeed.com** – Reads the title and text of the job ad the user has open on Indeed (Indeed has no public API) and shows the Meritio button there.

## Data use disclosure (Web Store form)
- Personally identifiable information: email (account). Purpose: app functionality.
- Authentication information: login token. Purpose: app functionality.
- User content: the user's CV and their answers. Purpose: app functionality (generating suggestions). Not sold, not used for unrelated purposes, not used for creditworthiness.
- Website content: the text of job ads the user opens. Purpose: app functionality.
Certify: data is not sold, not used for purposes unrelated to the extension's single purpose, not used to determine creditworthiness.

## Screenshots to take (1280×800)
1. Platsbanken ad with the Meritio button and the side panel showing the fit line and requirement verdicts.
2. The review overlay: CV with red/green tracked changes and a bubble with "Motivering".
3. The "Saknas i ditt CV" card with a question and the formulated line.
4. Download buttons and the PDF result next to the original (same layout).
5. Indeed list with the selected ad and the panel.
