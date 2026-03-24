# Invect Seed Scripts

This directory contains seed scripts to populate your Invect database with example flows.

## Available Seeds

### Lord of the Rings Quest Flow
- **File**: `lord-of-rings-quest-seed.ts`
- **Description**: A comprehensive quest analysis flow that demonstrates all Invect node types using a Middle-earth theme
- **Features**:
  - Input nodes for character name, quest type, and danger level
  - SQL query node to check fellowship records
  - Template string nodes for dynamic content generation
  - AI model node for quest analysis
  - JQ node for data transformation
  - If-else nodes for conditional logic
  - Output node for final results

## Running Seeds

### Run All Seeds
```bash
npm run seed
```

### Run Specific Seeds
```bash
# Lord of the Rings quest flow only
npm run seed:lotr
```

### Manual Execution
```bash
# Run individual seed files directly
tsx seed/lord-of-rings-quest-seed.ts
```

## Prerequisites

1. **Environment Variables**: Make sure you have a `.env` file with required API keys:
   ```env
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

2. **Database**: The seed scripts will use the SQLite database at `./dev.db` (created automatically)

3. **Dependencies**: Install dependencies first:
   ```bash
   npm install
   ```

## What Gets Created

After running the seeds, you'll have:

- **Flows**: Complete flow definitions stored in the database
- **Flow Versions**: Versioned flow configurations ready for execution
- **Node Definitions**: All node types with proper configurations
- **Edge Connections**: Proper data flow between nodes

## Using Seeded Flows

Once seeded, you can:

1. **View in Frontend**: Connect the Invect frontend to see the visual flow
2. **Execute Flows**: Run the flows with different input parameters
3. **Modify Flows**: Use as templates for creating new flows
4. **Test Features**: Experiment with different node types and configurations

## Example Execution

After seeding, you can execute the Lord of the Rings quest flow with inputs like:

```json
{
  "characterName": "Aragorn",
  "questType": "reclaim the throne of Gondor",
  "dangerLevel": "7"
}
```

The flow will analyze the character's suitability for the quest and provide recommendations based on the danger level and character capabilities.