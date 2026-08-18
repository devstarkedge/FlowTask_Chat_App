import { useChatStore } from '../stores/chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      connectionStatus: 'disconnected',
      offlineQueueStatus: {},
    });
  });

  it('should initialize with disconnected state', () => {
    const state = useChatStore.getState();
    expect(state.connectionStatus).toBe('disconnected');
    expect(state.offlineQueueStatus).toEqual({});
  });

  it('should update connection status', () => {
    useChatStore.setState({ connectionStatus: 'connected' });
    const state = useChatStore.getState();
    expect(state.connectionStatus).toBe('connected');
  });
});
