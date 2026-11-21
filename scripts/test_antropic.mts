import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic()
const response = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 50,
  messages: [
    {
      role: "user",
      content: "Respond with a single word: Ready"
    }
  ]
});
console.log(response.content, response.usage);