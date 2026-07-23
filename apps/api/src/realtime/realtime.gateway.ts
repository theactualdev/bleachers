import {
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { MatchEvent } from '@bleachers/types';
import { env } from '../config/env.js';

const room = (matchId: string) => `match:${matchId}`;

/**
 * Broadcasts live match updates to subscribed clients. Each match is a Socket.IO room; scorers
 * and viewers join it to receive new/voided events in real time. Stats are recomputed client-side
 * from the event stream (the engine runs on both ends), so we only push events, not derived state.
 */
@WebSocketGateway({
  cors: { origin: env.webOrigins, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(): void {
    // Auth for sockets is intentionally light in Phase 1: rooms carry only public match events,
    // which are also available on the public match page. Write paths remain REST + guarded.
  }

  @SubscribeMessage('match:join')
  onJoin(@MessageBody() matchId: string, @ConnectedSocket() client: Socket): { joined: string } {
    client.join(room(matchId));
    return { joined: matchId };
  }

  @SubscribeMessage('match:leave')
  onLeave(@MessageBody() matchId: string, @ConnectedSocket() client: Socket): { left: string } {
    client.leave(room(matchId));
    return { left: matchId };
  }

  broadcastEvent(matchId: string, event: MatchEvent): void {
    this.server?.to(room(matchId)).emit('event:new', event);
  }

  broadcastVoid(matchId: string, eventId: string): void {
    this.server?.to(room(matchId)).emit('event:void', { matchId, eventId });
  }
}
