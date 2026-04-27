"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliverablesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const deliverable_entity_1 = require("./entities/deliverable.entity");
const deliverable_team_member_entity_1 = require("./entities/deliverable-team-member.entity");
const deliverable_history_entity_1 = require("./entities/deliverable-history.entity");
const task_entity_1 = require("../tasks/entities/task.entity");
const project_entity_1 = require("../projects/entities/project.entity");
const user_entity_1 = require("../users/entities/user.entity");
const deliverables_service_1 = require("./deliverables.service");
const deliverables_controller_1 = require("./deliverables.controller");
const notifications_module_1 = require("../notifications/notifications.module");
let DeliverablesModule = class DeliverablesModule {
};
exports.DeliverablesModule = DeliverablesModule;
exports.DeliverablesModule = DeliverablesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                deliverable_entity_1.Deliverable,
                deliverable_team_member_entity_1.DeliverableTeamMember,
                deliverable_history_entity_1.DeliverableHistory,
                task_entity_1.Task,
                project_entity_1.Project,
                user_entity_1.User,
            ]),
            (0, common_1.forwardRef)(() => notifications_module_1.NotificationsModule),
        ],
        controllers: [deliverables_controller_1.DeliverablesController],
        providers: [deliverables_service_1.DeliverablesService],
        exports: [deliverables_service_1.DeliverablesService],
    })
], DeliverablesModule);
//# sourceMappingURL=deliverables.module.js.map