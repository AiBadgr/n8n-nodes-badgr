import type {
	IDataObject,
	JsonObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const DEFAULT_IMAGE =
	'python:3.11-slim@sha256:0dd364ba7e10242f07755449e3a3d0e35f9efd987952737b90def6709ab0c5ce';

export class Badgr implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Badgr',
		name: 'badgr',
		icon: { light: 'file:badgr.svg', dark: 'file:badgr.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Run GPU workloads and deploy models on Badgr',
		defaults: { name: 'Badgr' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'badgrApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'runWorkload',
				options: [
					{ name: 'Run Workload', value: 'runWorkload', action: 'Run a one off GPU workload' },
					{ name: 'Deploy Model', value: 'deployModel', action: 'Deploy a model endpoint' },
					{ name: 'Check Result', value: 'checkResult', action: 'Check a deployment and read its logs' },
					{ name: 'Stop', value: 'stop', action: 'Stop a deployment and end billing' },
				],
			},
			{
				displayName: 'Command',
				name: 'command',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'python train.py --epochs 10',
				description: 'Command to run. It is split on spaces; use a script file for anything with quoting.',
				displayOptions: { show: { operation: ['runWorkload'] } },
			},
			{
				displayName: 'Docker Image',
				name: 'image',
				type: 'string',
				default: DEFAULT_IMAGE,
				displayOptions: { show: { operation: ['runWorkload'] } },
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'meta-llama/Llama-3.1-8B-Instruct',
				displayOptions: { show: { operation: ['deployModel'] } },
			},
			{
				displayName: 'Max Runtime (Minutes)',
				name: 'maxRuntimeMinutes',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 30,
				required: true,
				description: 'The endpoint stops itself after this long, so billing cannot run open ended',
				displayOptions: { show: { operation: ['deployModel'] } },
			},
			{
				displayName: 'GPU',
				name: 'gpu',
				type: 'options',
				default: 'RTX_4090',
				options: [
					{ name: 'RTX 4090', value: 'RTX_4090' },
					{ name: 'L40S', value: 'L40S' },
					{ name: 'A100', value: 'A100' },
					{ name: 'H100', value: 'H100' },
				],
				displayOptions: { show: { operation: ['runWorkload', 'deployModel'] } },
			},
			{
				displayName: 'Max Price per Hour (USD)',
				name: 'maxPricePerHour',
				type: 'number',
				typeOptions: { minValue: 0.01 },
				default: 2,
				required: true,
				description: 'Hard price cap. Required so a workflow cannot spend without a limit.',
				displayOptions: { show: { operation: ['runWorkload', 'deployModel'] } },
			},
			{
				displayName: 'Deployment ID',
				name: 'deploymentId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['checkResult', 'stop'] } },
			},
			{
				displayName: 'Log Lines',
				name: 'logLines',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 500 },
				default: 50,
				displayOptions: { show: { operation: ['checkResult'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('badgrApi');
		const baseUrl = String(credentials.baseUrl || 'https://aibadgr.com/v1').replace(/\/$/, '');

		const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: IDataObject) =>
			(await this.helpers.httpRequestWithAuthentication.call(this, 'badgrApi', {
				method,
				url: `${baseUrl}${path}`,
				body,
				json: true,
			})) as IDataObject;

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let json: IDataObject;

				if (operation === 'runWorkload') {
					const command = (this.getNodeParameter('command', i) as string).trim();
					if (!command) throw new NodeOperationError(this.getNode(), 'Command is required', { itemIndex: i });
					json = await call('POST', '/run', {
						command: command.split(/\s+/),
						image: this.getNodeParameter('image', i) as string,
						gpu: this.getNodeParameter('gpu', i) as string,
						max_price_per_hour: this.getNodeParameter('maxPricePerHour', i) as number,
					});
				} else if (operation === 'deployModel') {
					json = await call('POST', '/serve', {
						model: this.getNodeParameter('model', i) as string,
						gpu: this.getNodeParameter('gpu', i) as string,
						max_price_per_hour: this.getNodeParameter('maxPricePerHour', i) as number,
						max_runtime_minutes: this.getNodeParameter('maxRuntimeMinutes', i) as number,
					});
				} else if (operation === 'checkResult') {
					const id = encodeURIComponent(this.getNodeParameter('deploymentId', i) as string);
					const limit = this.getNodeParameter('logLines', i) as number;
					const deployment = await call('GET', `/deployments/${id}`);
					const logs = limit > 0 ? await call('GET', `/deployments/${id}/logs`) : { logs: [] };
					const lines = ((logs.logs as string[]) || []).slice(-limit);
					json = { ...deployment, lines, log_text: lines.join('\n') };
				} else if (operation === 'stop') {
					const id = encodeURIComponent(this.getNodeParameter('deploymentId', i) as string);
					json = await call('DELETE', `/deployments/${id}`);
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
				}
				out.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error instanceof NodeOperationError
					? new NodeOperationError(this.getNode(), error.message, { itemIndex: i })
					: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}
		return [out];
	}
}
