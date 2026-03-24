

- If an sql node or model node fails, the entire flow execution should fail and return an error with the failed node details.
- Nodes should only execute once it is their turn
- Flows should be in an invalid state if there is a node or set of nodes that are not connected to an output
- If a flow is in an invalid state, it should not be possible to execute it
- In the execution history, should be able to view the state of the graph for that specific execution
- If else should be able to handle some string logic