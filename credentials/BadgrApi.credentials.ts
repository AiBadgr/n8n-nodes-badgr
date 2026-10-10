import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class BadgrApi implements ICredentialType {
	name = 'badgrApi';
	displayName = 'Badgr API';
	icon = { light: 'file:badgr.svg', dark: 'file:badgr.dark.svg' } as const;
	documentationUrl = 'https://aibadgr.com/docs';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://aibadgr.com/v1',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/deployments' },
	};
}
