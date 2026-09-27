# **PRODUCT REQUIREMENTS DOCUMENT**

## **Working Product Name**

**Daily Planning Assistant**

*Final product name to be decided.*

---

## **1\. Product Overview**

This product is an AI-powered daily planning assistant for people who struggle to organise their intentions, prioritise activities, and follow through on what they want to accomplish.

The user can freely enter everything they want or need to do. The AI then helps them understand the activities, identify priorities, determine what is realistically achievable, and create a suggested plan.

The user remains in control of the final plan.

The product also supports focused work and healthy breaks, while allowing people to plan around their actual schedules rather than assuming that everyone is most productive during conventional daytime hours.

---

## **2\. Problem Statement**

People often have many things they want or need to accomplish but struggle to turn those intentions into a realistic plan.

They may not know which activity should come first, may plan more activities than they can reasonably complete, or may become distracted and lose track of what they intended to do.

People also have different schedules. Some work during the night, some work with organisations in different time zones, while others simply prefer doing certain activities at night.

A useful planning tool therefore needs to work around the individual's actual schedule rather than assuming that everyone follows the same daily routine.

---

## **3\. Target Users**

### **Primary User**

Everyday individuals who want help planning and following through on their daily activities.

This can include:

* Students  
* Employees  
* Remote workers  
* Freelancers  
* Entrepreneurs  
* People with flexible schedules  
* People who naturally prefer working at night

The product should remain broad enough to serve different types of users without requiring a specific profession or lifestyle.

---

## **4\. Product Goal**

The product should help users move from:

**“I have so many things I want to do.”**

to:

**“I know what I should focus on, why it matters, and how I can realistically approach my day.”**

The product should help users:

1. Capture their intentions without having to organise them first.  
2. Clarify important information about their activities.  
3. Prioritise activities.  
4. Identify what is realistically achievable.  
5. Create a flexible plan around their schedule.  
6. Adjust the plan themselves.  
7. Stay focused while working.  
8. Take appropriate breaks.  
9. Review their progress.  
10. Carry unfinished activities into future planning sessions.

---

# **5\. Core Product Experience**

The core experience is:

**Brain Dump → Understand → Prioritise → Reality Check → Plan → Adjust → Focus → Break → Review**

The AI should act as a planning assistant, not as an authority that makes decisions for the user.

The AI recommends.

The user decides.

---

# **6\. Customer Journey**

### **01\. Open the Application**

The user opens the application and signs in or creates an account.

### **02\. Choose Planning Session**

The user chooses to plan:

* The next day  
* The current day

Planning the next day, particularly the night before, is the primary use case.

### **03\. Brain Dump**

The application prompts:

**“What’s on your mind? Tell me everything you want to get done.”**

The user enters their activities freely.

They do not need to organise, rank, or filter their thoughts before submitting them.

### **04\. AI Clarification**

The AI reviews the activities.

Where necessary, it asks concise questions to understand:

* Importance  
* Urgency  
* Deadline  
* Estimated effort  
* Whether the activity must happen that day  
* Dependencies between activities

The AI should avoid unnecessary questions.

### **05\. AI Prioritisation**

The AI organises activities according to the information provided.

It may identify:

* High priority  
* Medium priority  
* Low priority / Can wait

Important recommendations should have a short explanation.

### **06\. Reality Check**

The AI considers whether the user's intentions are realistic for the available planning period.

If the user has too many activities, the AI should not simply attempt to fit everything into the day.

It should recommend what to focus on first and what can reasonably wait.

### **07\. Suggested Plan**

The AI creates a suggested plan based on:

* Priorities  
* Deadlines  
* Estimated effort  
* Dependencies  
* User's schedule  
* User's preferred productive period

The plan may include approximate time blocks and appropriate breaks.

### **08\. User Adjustment**

The user reviews the recommendation.

They can:

* Edit an activity  
* Add an activity  
* Remove an activity  
* Reorder activities  
* Adjust suggested times

The user has final control over the plan.

### **09\. Focus Session**

The user selects an activity and starts a focus session.

The application displays the active activity and a simple timer.

### **10\. Break**

After an appropriate period of focused work, the application can suggest a short break.

Break guidance may encourage simple actions such as:

* Standing up  
* Stretching  
* Resting the eyes  
* Drinking water

The product should not present itself as a medical or health-monitoring application.

### **11\. Daily Review**

The user reviews the day's activities.

Activities can be marked:

* Completed  
* Partially completed  
* Not completed

### **12\. Carry Forward**

Unfinished activities can be carried forward and considered during another planning session.

---

# **7\. Functional Requirements**

## **FR-01: Account Management**

The application must allow users to create an account and sign in.

User planning information must be associated with the appropriate account.

---

## **FR-02: Planning Sessions**

The application must allow users to create a planning session for a selected day.

The user should be able to plan for today or tomorrow.

---

## **FR-03: Flexible Schedule**

The application must not assume that users are productive only during daytime hours.

Users should be able to indicate their preferred or relevant productive period.

The system should use this information when generating suggestions.

---

## **FR-04: Freeform Brain Dump**

The application must allow users to enter multiple activities in natural language.

Users should not be required to categorise activities before submitting them.

---

## **FR-05: AI Clarification**

The application must analyse submitted activities and identify when additional information is needed.

The AI should ask relevant follow-up questions before generating the final plan.

---

## **FR-06: AI Prioritisation**

The application must assign relative priority to activities based on information provided by the user.

The AI should provide a concise explanation for significant recommendations.

---

## **FR-07: Realistic Planning**

The application must consider whether the user's requested activities can reasonably fit within the planning period.

When the activity list is unrealistic, the application should recommend a smaller set of priorities rather than automatically scheduling everything.

---

## **FR-08: Plan Generation**

The application must generate a suggested plan containing the user's prioritised activities and suggested ordering or time blocks.

The plan should account for appropriate breaks.

---

## **FR-09: Plan Editing**

The user must be able to modify the AI-generated plan.

Changes should include adding, removing, editing, reordering, and adjusting activities or suggested times.

---

## **FR-10: Focus Sessions**

The application must allow a user to start a focus session for a selected activity.

The session must display the activity and provide a timer.

---

## **FR-11: Break Support**

The application should provide simple break reminders after appropriate periods of focused activity.

Users should be able to continue after the break.

---

## **FR-12: Activity Status**

Users must be able to update the status of activities.

Supported statuses:

* Not Started  
* In Progress  
* Completed  
* Partially Completed  
* Carried Forward

---

## **FR-13: Daily Review**

The application must provide a simple summary of the user's progress at the end of a planning period.

---

## **FR-14: Saved History**

The application must save previous planning sessions and activity outcomes.

Users should be able to access previous plans.

---

# **8\. AI Behaviour Requirements**

The AI should:

* Understand natural-language activity descriptions.  
* Ask only relevant clarification questions.  
* Consider urgency, importance, deadlines and effort.  
* Identify potential conflicts or unrealistic workloads.  
* Recommend priorities rather than simply sorting alphabetically or chronologically.  
* Explain important recommendations briefly.  
* Suggest realistic plans.  
* Respect the user's preferred schedule.  
* Include reasonable breaks.  
* Allow the user to disagree with or modify its recommendations.  
* Avoid presenting recommendations as absolute instructions.

The AI should prioritise **realistic completion over filling the schedule with as many activities as possible.**

---

# **9\. User Interface Requirements**

The interface should be simple and easy to understand.

The primary experience should not require the user to navigate through many screens before beginning a planning session.

The main interaction should feel conversational during the brain-dump and clarification stages.

The user should always be able to see:

* What they planned  
* What they should focus on  
* What they are currently working on  
* What has been completed  
* What remains

---

# **10\. Version 1 Scope**

Version 1 should focus on proving the core product experience.

### **Included**

* Account creation/sign-in  
* Today/tomorrow planning  
* Freeform brain dump  
* AI clarification  
* AI prioritisation  
* Realistic workload assessment  
* AI-generated plan  
* Flexible productive periods  
* User plan adjustments  
* Focus timer  
* Break reminders  
* Activity completion  
* Daily review  
* Saved planning history

### **Not Included in Version 1**

* Device-level social media blocking  
* Complex calendar integrations  
* Wearable integrations  
* Sleep tracking  
* Health monitoring  
* Voice assistant  
* Team collaboration  
* Advanced habit tracking  
* Fitness tracking  
* Financial tracking  
* Advanced productivity analytics  
* Complex notification systems

These may be considered in future versions if they support the product's direction.

---

# **11\. Acceptance Criteria**

### **Brain Dump**

A user can enter several activities in natural language and submit them for planning without first categorising them.

### **AI Clarification**

When necessary information is missing, the AI asks relevant questions before producing the final plan.

### **Prioritisation**

The system presents activities with understandable priority levels and gives concise reasons for important recommendations.

### **Reality Check**

If the user enters more activities than can reasonably be completed, the system identifies the workload as unrealistic and recommends which activities should receive focus.

### **Flexible Planning**

The system can generate a plan for users whose productive period occurs in the morning, afternoon, evening, night, or varies.

### **User Control**

The user can modify the AI-generated plan before using it.

### **Focus**

The user can start a focus session for a selected activity and see a timer.

### **Breaks**

The system can remind the user to take a break after a period of focused work.

### **Review**

The user can mark activities as completed, partially completed, or unfinished and review the result of the day.

### **Persistence**

Previous plans remain available to the user after leaving and returning to the application.

---

# **12\. Conditions for Success**

The first version should demonstrate that:

1. A user can enter an unorganised list of intentions.  
2. The AI can understand and clarify those intentions.  
3. The AI can identify priorities.  
4. The AI can recognise when the user is trying to do too much.  
5. The AI can produce a realistic suggested plan.  
6. The user can modify the recommendation.  
7. The user can use the plan while completing activities.  
8. The application supports focused work and appropriate breaks.  
9. The user can review what happened at the end of the day.  
10. The user's plans are saved for future use.

---

# **13\. Product Principle**

The product should help users organise their lives without making them feel controlled by the application.

The AI is a planning assistant.

The user remains the decision-maker.

The goal is not to maximise the number of tasks completed. The goal is to help the user make a realistic plan around what matters and follow through on it.

---

# **14\. Implementation Plan — Task 1 (V1 Build Order)**

## **Technology Choices**

* **Framework:** Node.js + Express backend with a vanilla HTML/CSS/JavaScript frontend (the frontend will become `design.html` in Task 2).
* **Database:** SQLite (local file database, better-sqlite3 / sqlite3 driver).
* **Authentication:** Local email + password authentication with bcrypt password hashing and server-side sessions (no third-party auth provider for V1).
* **File storage:** Local filesystem storage (no cloud object storage for V1).
* **Local run statement:** The app and database will run locally for now. No cloud hosting, managed database, or external auth/file service is required for V1.

## **Ordered Phases and Deliverables**

### **Phase 1 — Local Foundation**

* Set up Node.js + Express project, SQLite schema, and local run docs.
* **Deliverables:** runnable local app skeleton, `schema.sql`, `README` run instructions (`npm install`, `npm start`), working local SQLite file.

### **Phase 2 — Accounts, Sessions, and Schedule (FR-01, FR-02, FR-03, FR-14)**

* Local sign-up/sign-in with sessions, today/tomorrow planning sessions, productive-period preference, saved history views.
* **Deliverables:** working auth flow, planning-session CRUD, schedule-preference setting, history page backed by SQLite.

### **Phase 3 — Brain Dump, Clarification, and Prioritisation (FR-04, FR-05, FR-06)**

* Freeform brain-dump input, clarification-question flow, High/Medium/Low prioritisation with explanations.
* **Deliverables:** brain-dump screen, clarification Q&A flow, prioritised activity list with reasons.

### **Phase 4 — Reality Check, Plan Generation, and Editing (FR-07, FR-08, FR-09)**

* Unrealistic-workload detection, suggested plan with ordering/time blocks/breaks, full user editing (add/remove/edit/reorder/retime).
* **Deliverables:** reality-check output, editable suggested plan, persisted final plan.

### **Phase 5 — Focus, Breaks, Review, and Carry Forward (FR-10, FR-11, FR-12, FR-13)**

* Focus timer per activity, break reminders, status updates, daily review summary, carry-forward of unfinished items.
* **Deliverables:** focus timer, break reminder, review screen, carry-forward action.

### **Phase 6 — Acceptance Pass and Hardening**

* End-to-end check against Section 11 acceptance criteria and Section 12 conditions for success using a local account and local database.
* **Deliverables:** verified V1 demo (plan → focus → review), fixed defects, updated local-run notes.

---

# **15\. Decision Note — Database Choice (Task 1 Review)**

* **Tool/technology choice:** Database for V1.
* **Alternative considered:** PostgreSQL (server-based relational database).
* **What was decided:** SQLite.
* **Why it was decided:** SQLite is a local file database with zero server setup, which matches the V1 constraint that the app and database will run locally for now. It is sufficient for a single-user local planning app (accounts, sessions, activities, plans, history), keeps installation to `npm install` + `npm start`, and avoids operating a database server. PostgreSQL was rejected for V1 because it adds server installation, user/role management, and connection ops without adding needed V1 capability; it can be revisited if a hosted multi-user version is built later.