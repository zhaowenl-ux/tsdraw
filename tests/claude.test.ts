import { describe, it, expect } from 'vitest';
import { ClaudeChat, ChemistryChat, ChatEvent } from '../src/app/claude';

/** A fake Claude API: returns the queued replies in order and records the requests. */
function fakeApi(replies: Array<{ status?: number; body: unknown }>) {
  const requests: any[] = [];
  const urls: string[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    urls.push(url);
    requests.push(JSON.parse(String(init.body)));
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, requests, urls };
}

describe('Ask Claude', () => {
  it('draws the molecule Claude asks for, sends the result back, and shows the final answer', async () => {
    const drawn: string[] = [];
    const { fetchFn, requests } = fakeApi([
      {
        body: {
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Here is aspirin.' },
            { type: 'tool_use', id: 't1', name: 'draw_molecule', input: { smiles: 'CC(=O)Oc1ccccc1C(=O)O', name: 'aspirin' } },
          ],
        },
      },
      { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Aspirin is C9H8O4.' }] } },
    ]);
    const chat = new ClaudeChat((smiles) => {
      drawn.push(smiles);
      return 13;
    }, fetchFn);
    const events: ChatEvent[] = [];
    await chat.ask('Draw aspirin', 'CCO', (e) => events.push(e));

    expect(drawn).toEqual(['CC(=O)Oc1ccccc1C(=O)O']);
    expect(events.map((e) => e.kind)).toEqual(['text', 'drawn', 'text']);
    // The current drawing went along as context, and the tool result came back to Claude.
    expect(requests[0].messages[0].content).toContain('CCO');
    expect(requests[0].tools[0].name).toBe('draw_molecule');
    expect(requests[1].messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });

  it('reports a bad SMILES back to Claude as an error so it can retry', async () => {
    const { fetchFn, requests } = fakeApi([
      { body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'draw_molecule', input: { smiles: 'C1CC' } }] } },
      { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry.' }] } },
    ]);
    const chat = new ClaudeChat(() => {
      throw new Error('a ring is never closed');
    }, fetchFn);
    const events: ChatEvent[] = [];
    await chat.ask('Draw it', '', (e) => events.push(e));
    expect(events[0]).toMatchObject({ kind: 'draw-failed', error: 'a ring is never closed' });
    expect(requests[1].messages[2].content[0]).toMatchObject({ is_error: true });
  });

  it('explains a missing API key, and forgets the failed exchange', async () => {
    const { fetchFn, requests } = fakeApi([
      { status: 401, body: { error: { message: 'invalid x-api-key' } } },
      { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hi' }] } },
    ]);
    const chat = new ClaudeChat(() => 0, fetchFn);
    await expect(chat.ask('Hello', '', () => {})).rejects.toThrow(/ANTHROPIC_API_KEY/);
    await chat.ask('Hello again', '', () => {});
    expect(requests[1].messages).toHaveLength(1); // the failed question is not resent
  });
});

describe('Ask ChatGPT (OpenAI Responses API)', () => {
  it('draws through a function call and sends the output back', async () => {
    const drawn: string[] = [];
    const { fetchFn, requests, urls } = fakeApi([
      {
        body: {
          output: [
            { type: 'reasoning', id: 'rs_1', summary: [] },
            { type: 'function_call', call_id: 'call_1', name: 'draw_molecule', arguments: '{"smiles":"CCO","name":"ethanol"}' },
          ],
        },
      },
      { body: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Ethanol, C2H6O.' }] }] } },
    ]);
    const chat = new ChemistryChat((smiles) => {
      drawn.push(smiles);
      return 3;
    }, fetchFn);
    chat.setProvider('openai');
    const events: ChatEvent[] = [];
    await chat.ask('Draw ethanol', '', (e) => events.push(e));

    expect(urls[0]).toBe('/api/openai/v1/responses');
    expect(requests[0].model).toBe('gpt-5.6-sol');
    expect(requests[0].tools[0]).toMatchObject({ type: 'function', name: 'draw_molecule' });
    expect(requests[0].instructions).toContain('tsdraw');
    expect(drawn).toEqual(['CCO']);
    expect(events.map((e) => e.kind)).toEqual(['drawn', 'text']);
    expect(requests[1].input.slice(1)).toEqual([
      { type: 'function_call', call_id: 'call_1', name: 'draw_molecule', arguments: '{"smiles":"CCO","name":"ethanol"}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'Drawn (3 heavy atoms).' },
    ]);
  });

  it('names the OpenAI key when it is missing', async () => {
    const { fetchFn } = fakeApi([{ status: 401, body: { error: { message: 'Incorrect API key' } } }]);
    const chat = new ChemistryChat(() => 0, fetchFn);
    chat.setProvider('openai');
    await expect(chat.ask('Hi', '', () => {})).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe('Ask Grok (xAI Chat Completions)', () => {
  it('draws through a tool call and sends the result back', async () => {
    const { fetchFn, requests, urls } = fakeApi([
      {
        body: {
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: 'Sure.',
                tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'draw_molecule', arguments: '{"smiles":"c1ccccc1"}' } }],
              },
            },
          ],
        },
      },
      { body: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Benzene.' } }] } },
    ]);
    const chat = new ChemistryChat(() => 6, fetchFn);
    chat.setProvider('grok');
    const events: ChatEvent[] = [];
    await chat.ask('Draw benzene', 'CC', (e) => events.push(e));

    expect(urls[0]).toBe('/api/xai/v1/chat/completions');
    expect(requests[0].messages[0].role).toBe('system');
    expect(requests[0].messages[1].content).toContain('CC');
    expect(requests[0].tools[0].function.name).toBe('draw_molecule');
    expect(events.map((e) => e.kind)).toEqual(['text', 'drawn', 'text']);
    expect(requests[1].messages[2].tool_calls[0].id).toBe('call_9');
    expect(requests[1].messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_9', content: 'Drawn (6 heavy atoms).' });
  });

  it('reports xAI errors given as a plain string', async () => {
    const { fetchFn } = fakeApi([{ status: 400, body: { code: 'bad', error: 'Model not found: grok-x' } }]);
    const chat = new ChemistryChat(() => 0, fetchFn);
    chat.setProvider('grok', 'grok-x');
    await expect(chat.ask('Hi', '', () => {})).rejects.toThrow('Grok API error 400: Model not found: grok-x');
  });
});

describe('Switching provider mid-conversation', () => {
  it('keeps the conversation and translates it, tool calls included', async () => {
    const { fetchFn, requests } = fakeApi([
      { body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_1', name: 'draw_molecule', input: { smiles: 'CCO' } }] } },
      { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } },
      { body: { choices: [{ message: { role: 'assistant', content: 'Its logP is about -0.3.' } }] } },
      { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] } },
    ]);
    const chat = new ChemistryChat(() => 3, fetchFn);
    await chat.ask('Draw ethanol', '', () => {});
    chat.setProvider('grok');
    await chat.ask('What is its logP?', 'CCO', () => {});

    const grok = requests[2].messages;
    expect(grok.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant', 'user']);
    expect(grok[2].tool_calls[0]).toMatchObject({ id: 'toolu_1', function: { name: 'draw_molecule' } });

    chat.setProvider('claude');
    await chat.ask('Thanks', '', () => {});
    expect(requests[3].messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
  });
});
