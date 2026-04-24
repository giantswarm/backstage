import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import { UIMessage } from 'ai';

export interface ConversationRecord {
  id: string;
  userId: string;
  messages: UIMessage[];
  title?: string;
  preview?: string;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ConversationListItem = Omit<ConversationRecord, 'messages'>;

export interface ConversationsResponse {
  conversations: ConversationListItem[];
  count: number;
}

export interface ConversationApi {
  getConversations(): Promise<ConversationsResponse>;
  getConversationById(id: string): Promise<ConversationRecord>;
  deleteConversation(id: string): Promise<void>;
  toggleConversationStar(id: string): Promise<{ isStarred: boolean }>;
  updateConversationTitle(
    id: string,
    title: string,
  ): Promise<{ title: string }>;
}

export class ConversationClient implements ConversationApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async getConversations(): Promise<ConversationsResponse> {
    const baseUrl = await this.discoveryApi.getBaseUrl('ai-chat');
    const response = await this.fetchApi.fetch(`${baseUrl}/conversations`);
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }

  async getConversationById(id: string): Promise<ConversationRecord> {
    const baseUrl = await this.discoveryApi.getBaseUrl('ai-chat');
    const response = await this.fetchApi.fetch(
      `${baseUrl}/conversations/${id}`,
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }

  async deleteConversation(id: string): Promise<void> {
    const baseUrl = await this.discoveryApi.getBaseUrl('ai-chat');
    const response = await this.fetchApi.fetch(
      `${baseUrl}/conversations/${id}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
  }

  async toggleConversationStar(id: string): Promise<{ isStarred: boolean }> {
    const baseUrl = await this.discoveryApi.getBaseUrl('ai-chat');
    const response = await this.fetchApi.fetch(
      `${baseUrl}/conversations/${id}/star`,
      { method: 'PATCH' },
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }

  async updateConversationTitle(
    id: string,
    title: string,
  ): Promise<{ title: string }> {
    const baseUrl = await this.discoveryApi.getBaseUrl('ai-chat');
    const response = await this.fetchApi.fetch(
      `${baseUrl}/conversations/${id}/title`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      },
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }
}
