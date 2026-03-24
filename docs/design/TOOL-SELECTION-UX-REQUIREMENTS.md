# Tool Selection & Configuration - UX Requirements

## Context

AI Agent nodes in the flow editor can be equipped with "tools" - capabilities that allow the agent to perform actions like making HTTP requests, querying data, doing calculations, etc. Users need a way to browse available tools, add them to an agent, and configure how each tool behaves.

---

## Core User Goals

### 1. Discover Available Tools
Users need to understand what tools exist and what each tool does before deciding to use it.

**User questions to answer:**
- What tools are available to me?
- What does this tool do?
- Is this the right tool for my use case?
- Are there similar tools I should consider?

### 2. Add Tools to an Agent
Users need to equip their AI agent with specific capabilities by adding tool instances.

**Key behaviors:**
- A single tool definition can be added multiple times (e.g., two HTTP Request tools configured for different APIs)
- Each addition creates a new "tool instance" with its own configuration
- Adding should be quick for users who know what they want

### 3. Configure Tool Instances
Users need to customize how each tool instance behaves, including what the AI sees and what values are pre-set.

**Configuration options per instance:**
- **Name**: What the AI sees this tool called (affects how/when AI chooses to use it)
- **Description**: What the AI understands about this tool's purpose
- **Parameters**: Each tool has parameters that can be either:
  - **Agent-provided**: AI decides the value at runtime (included in tool's schema)
  - **User-provided (static)**: User sets a fixed value that's always used

### 4. Manage Added Tools
Users need to see what tools are attached to an agent and modify or remove them.

**User questions to answer:**
- What tools does this agent currently have?
- How is each tool configured?
- Which tool do I need to edit?

---

## Information Architecture

### Tool Definition (Template)
The base definition of a tool, provided by the system:
- **ID**: Unique identifier
- **Name**: Human-readable name
- **Description**: What the tool does
- **Category**: Grouping (Data, Web, Code, Utility, Custom)
- **Tags**: Additional labels for filtering
- **Input Schema**: JSON Schema describing parameters the AI must provide
- **Documentation URL**: Optional link to docs

### Tool Instance (User's Configuration)
A configured copy of a tool attached to a specific agent:
- **Instance ID**: Unique to this agent
- **Tool ID**: Which tool definition this is based on
- **Custom Name**: User's override (or default from definition)
- **Custom Description**: User's override (or default from definition)
- **Parameter Settings**: For each parameter:
  - Is it agent-provided or static?
  - If static, what's the value?

### Categories
Tools are organized into categories:
- **Data**: Database queries, data transformations (JQ)
- **Web**: HTTP requests, API calls
- **Code**: Code execution, scripting
- **Utility**: Math, logic, helpers
- **Custom**: User-defined tools (future)

---

## User Tasks & Workflows

### Task 1: Find a Tool

**Starting points:**
- User has a vague idea ("I need to call an API")
- User knows the exact tool name
- User is exploring what's possible

**Discovery methods:**
- Browse by category
- Search by name/description/tags
- Filter by tags for cross-category concepts

**Information needed to evaluate a tool:**
- Name and description
- What parameters it requires
- Example use cases (nice to have)
- Full input schema for advanced users

### Task 2: Add a Tool to Agent

**Quick add**: User knows what they want
- Search → Find → Add in minimal clicks

**Considered add**: User wants to preview first
- Select tool → Read details → Decide → Add

**Bulk add**: User wants multiple tools
- Add several tools in sequence without closing/reopening

**Post-add behavior:**
- Tool appears in agent's tool list
- User may want to immediately configure, or continue adding more

### Task 3: Configure a Tool Instance

**Access configuration:**
- From the agent's tool list
- Immediately after adding

**Configuration workflow:**
1. See current configuration state
2. Optionally customize name (affects AI's understanding)
3. Optionally customize description (affects AI's understanding)
4. For each parameter:
   - Decide: Should AI provide this, or should I set a static value?
   - If static: Enter the value

**Special case - Credentials:**
- Some tools require authentication credentials
- Credentials are ALWAYS static (never AI-provided for security)
- User must either:
  - Select an existing credential
  - Create a new credential (may involve OAuth flow)

**Feedback needed:**
- Visual indication of which parameters are static vs agent-provided
- Preview of "effective schema" - what the AI will actually see

### Task 4: Review Agent's Tools

**Needs:**
- See all tools attached to agent at a glance
- Quickly identify each tool's purpose
- Access configuration for any tool
- Remove tools no longer needed

**From the canvas (at-a-glance view):**
- Compact visualization of attached tools
- Quick actions (configure, remove)

**From detailed view:**
- Full list with more information
- Easier management for agents with many tools

### Task 5: Remove a Tool

**Quick remove**: Confident action
- Single click/action to remove

**Confirmed remove**: Prevent accidents
- May want confirmation for tools with custom configuration

---

## Parameter Configuration Deep Dive

### The Agent-Provided vs Static Decision

For each tool parameter, users must understand:

**Agent-provided (default):**
- The parameter appears in the tool's schema sent to the AI
- AI decides what value to use based on context
- More flexible but less controlled

**Static (user-provided):**
- User enters a fixed value
- Parameter is removed from schema (AI doesn't see it)
- Value is injected automatically when tool runs
- More controlled but less flexible

**Example - HTTP Request tool:**
- `url`: User might set static for a specific API, or let AI decide
- `method`: Often static (e.g., always POST), but could be dynamic
- `body`: Usually agent-provided (AI constructs based on task)
- `headers`: Often static (auth headers), sometimes dynamic

### Credential Parameters

Special handling required:
- Never agent-provided (security)
- Dropdown/selector for existing credentials
- Ability to create new credential inline
- OAuth2 tools need provider-specific authentication flow
- Clear indication of credential status (connected, expired, missing)

---

## Edge Cases & Considerations

### Multiple Instances of Same Tool
- User adds "HTTP Request" twice, configured for different APIs
- Need clear visual distinction between instances
- Custom names become important for differentiation

### Many Tools on One Agent
- Some agents might have 10+ tools
- Need scalable UI that doesn't overwhelm
- Consider grouping, collapsing, or pagination

### Tool Discovery for New Users
- First-time users don't know what tools exist
- Categories and descriptions must be clear
- Consider "recommended" or "popular" tools

### Configuration Validation
- Some parameters have constraints (required, format, enum)
- Static values should be validated
- Clear error states when configuration is invalid

### Schema Preview for Advanced Users
- Power users want to see the actual JSON schema
- Show how static parameters affect the schema
- Useful for debugging AI behavior

---

## Success Metrics

A good tool selection UI should enable users to:

1. **Find tools quickly** - Minimal time from intent to discovery
2. **Understand tools before adding** - Low rate of adding wrong tool
3. **Configure confidently** - Clear understanding of agent vs static
4. **Manage at scale** - Usable with 1 tool or 15 tools
5. **Iterate easily** - Quick to try different configurations

---

## Open Questions for Design Exploration

1. **Entry point**: Modal vs sidebar vs inline expansion?
2. **Browse vs search priority**: Which is primary interaction?
3. **Add then configure vs configure while adding**: When does configuration happen?
4. **Canvas representation**: How much tool info shows on the node itself?
5. **Bulk operations**: Select multiple tools? Duplicate instances?
6. **Presets/templates**: Save tool configurations for reuse?
