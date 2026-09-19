# Hermes Agent Learnings

## Overview
  Hermes Agent is a self-improving AI agent framework by Nous Research. It is designed to run continuously across chat and terminal interfaces,
  with support for messaging gateways, automation, persistent memory, and reusable skills.

## Skills System
  A skill is a reusable capability or workflow the agent can invoke repeatedly. Skills turn repeatable behavior into something packaged and
  callable instead of relearned each time.

  Key points:
  - Hermes can create skills from experience
  - Skills can be improved over time
  - Skills are available through the CLI
  - The repo supports the `agentskills.io` open standard
  - Skills can be invoked by name, like `/skill-name`

  Practical interpretation:
  - Prompt = one-off instruction
  - Skill = reusable procedure
  - Tool = lower-level capability a skill may use

## Memory System
  Hermes memory is for persistent recall across sessions. It is meant to store curated knowledge rather than raw chat history.

  Key points:
  - Uses agent-curated memory
  - Can store summaries of past sessions
  - Supports retrieval of past context
  - Helps build a deeper model of the user over time
  - Uses search/summarization so old context stays usable

  Practical interpretation:
  - Chat history = raw transcript
  - Memory = selected long-term facts and summaries
  - Memory is what makes the agent remember stable preferences and recurring context

## How Skills and Memory Work Together
  The system appears to use a learning loop:

  1. A task is completed
  2. Reusable patterns may be saved as memory
  3. Procedural patterns may become or update a skill
  4. Future tasks can reuse both memory and skills

  This is what makes Hermes feel more adaptive than a normal chatbot.

## Practical Takeaways
  If using Hermes well:
  - Store stable preferences in memory
  - Turn repeated workflows into skills
  - Keep memory curated so it stays useful
  - Use history search for older context
  - Treat skills as reusable automation, not just notes
