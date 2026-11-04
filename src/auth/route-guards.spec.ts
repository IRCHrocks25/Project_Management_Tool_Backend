import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DeliverablesController } from '../deliverables/deliverables.controller';
import { EmailsController } from '../emails/emails.controller';
import { WebhookGuard } from '../projects/guards/webhook.guard';
import { ProjectsController } from '../projects/projects.controller';
import { TasksController } from '../tasks/tasks.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/** Every route of a controller, with the guards that protect it. */
const routesOf = (controller: any) => {
  const classGuards = Reflect.getMetadata(GUARDS_METADATA, controller) || [];
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => Reflect.getMetadata(METHOD_METADATA, controller.prototype[name]) !== undefined)
    .map((name) => ({
      name,
      guards: [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, controller.prototype[name]) || [])],
    }));
};

describe('client data routes require authentication', () => {
  it.each([
    ['projects', ProjectsController],
    ['tasks', TasksController],
    ['deliverables', DeliverablesController],
    ['emails', EmailsController],
  ])('%s: every route has a login or webhook guard', (_label, controller) => {
    const routes = routesOf(controller);
    expect(routes.length).toBeGreaterThan(0);
    const open = routes.filter((r) => !r.guards.includes(JwtAuthGuard) && !r.guards.includes(WebhookGuard));
    expect(open.map((r) => r.name)).toEqual([]);
  });

  it('keeps the project webhooks on the webhook secret, not a user login', () => {
    const routes = routesOf(ProjectsController);
    const webhook = routes.filter((r) => r.guards.includes(WebhookGuard));
    expect(webhook.map((r) => r.name).sort()).toEqual(['createFromWebhook', 'getWebhookPM']);
    webhook.forEach((r) => expect(r.guards).not.toContain(JwtAuthGuard));
  });
});
