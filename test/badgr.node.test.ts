import { describe, it, expect, vi } from 'vitest';
import { Badgr } from '../nodes/Badgr/Badgr.node';
import { BadgrApi } from '../credentials/BadgrApi.credentials';

// Fake IExecuteFunctions: only the Badgr HTTP API (httpRequestWithAuthentication) is mocked.
function ctx(params: Record<string, unknown>, responses: Record<string, unknown>, opts: { continueOnFail?: boolean } = {}) {
	const calls: Array<{ method: string; url: string; body?: unknown }> = [];
	const fn = {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ apiKey: 'k', baseUrl: 'https://api.test/v1/' }),
		getNodeParameter: (name: string) => params[name],
		getNode: () => ({ name: 'Badgr' }),
		continueOnFail: () => !!opts.continueOnFail,
		helpers: {
			httpRequestWithAuthentication: vi.fn(async (_cred: string, req: { method: string; url: string; body?: unknown }) => {
				calls.push(req);
				const key = `${req.method} ${req.url.replace('https://api.test/v1', '')}`;
				if (!(key in responses)) throw new Error(`unexpected ${key}`);
				return responses[key];
			}),
		},
	};
	return { fn, calls };
}

const exec = (c: ReturnType<typeof ctx>) => new Badgr().execute.call(c.fn as never);

describe('Badgr node', () => {
	it('exposes four operations and requires the credential', () => {
		const d = new Badgr().description;
		expect((d.properties[0] as { options: Array<{ value: string }> }).options.map(o => o.value))
			.toEqual(['runWorkload', 'deployModel', 'checkResult', 'stop']);
		expect(d.credentials?.[0]).toMatchObject({ name: 'badgrApi', required: true });
	});

	it('runWorkload posts a capped /run request', async () => {
		const c = ctx(
			{ operation: 'runWorkload', command: 'python train.py --epochs 2', image: 'img', gpu: 'A100', maxPricePerHour: 3 },
			{ 'POST /run': { deployment_id: 'dep-n1', status: 'running' } },
		);
		const [[item]] = await exec(c);
		expect(item.json.deployment_id).toBe('dep-n1');
		expect(c.calls[0].body).toMatchObject({ command: ['python', 'train.py', '--epochs', '2'], gpu: 'A100', max_price_per_hour: 3 });
	});

	it('deployModel sends the required runtime limit', async () => {
		const c = ctx(
			{ operation: 'deployModel', model: 'm/x', gpu: 'L40S', maxPricePerHour: 2, maxRuntimeMinutes: 15 },
			{ 'POST /serve': { deployment_id: 'dep-n2' } },
		);
		await exec(c);
		expect(c.calls[0].body).toMatchObject({ model: 'm/x', max_runtime_minutes: 15, max_price_per_hour: 2 });
	});

	it('checkResult merges state with the last N log lines', async () => {
		const c = ctx(
			{ operation: 'checkResult', deploymentId: 'dep-n3', logLines: 2 },
			{ 'GET /deployments/dep-n3': { status: 'running' }, 'GET /deployments/dep-n3/logs': { logs: ['a', 'b', 'c'] } },
		);
		const [[item]] = await exec(c);
		expect(item.json).toMatchObject({ status: 'running', lines: ['b', 'c'], log_text: 'b\nc' });
	});

	it('stop deletes the deployment', async () => {
		const c = ctx({ operation: 'stop', deploymentId: 'dep-n4' }, { 'DELETE /deployments/dep-n4': { status: 'stopped' } });
		const [[item]] = await exec(c);
		expect(item.json.status).toBe('stopped');
	});

	it('rejects an empty command without calling the API', async () => {
		const c = ctx({ operation: 'runWorkload', command: '  ', image: 'i', gpu: 'A100', maxPricePerHour: 1 }, {});
		await expect(exec(c)).rejects.toThrow('Command is required');
		expect(c.calls).toHaveLength(0);
	});

	it('returns the error per item when continueOnFail is set', async () => {
		const c = ctx({ operation: 'stop', deploymentId: 'x' }, {}, { continueOnFail: true });
		const [[item]] = await exec(c);
		expect(String(item.json.error)).toContain('unexpected');
	});
});

describe('error handling', () => {
	it('wraps API failures in NodeApiError instead of re-throwing raw errors', async () => {
		const { NodeApiError } = await import('n8n-workflow');
		const c = ctx({ operation: 'stop', deploymentId: 'x' }, {});
		await expect(exec(c)).rejects.toBeInstanceOf(NodeApiError);
	});
});

describe('BadgrApi credentials', () => {
	it('sends the key as a bearer token', () => {
		const cred = new BadgrApi();
		expect((cred.authenticate as { properties: { headers: Record<string, string> } }).properties.headers.Authorization)
			.toContain('Bearer');
		expect(cred.properties.find(p => p.name === 'apiKey')?.typeOptions).toMatchObject({ password: true });
	});
});
