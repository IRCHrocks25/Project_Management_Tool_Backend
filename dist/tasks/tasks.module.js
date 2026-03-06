"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const tasks_service_1 = require("./tasks.service");
const tasks_controller_1 = require("./tasks.controller");
const task_entity_1 = require("./entities/task.entity");
const task_assignee_entity_1 = require("./entities/task-assignee.entity");
const task_file_history_entity_1 = require("./entities/task-file-history.entity");
const task_question_entity_1 = require("./entities/task-question.entity");
const task_comment_entity_1 = require("./entities/task-comment.entity");
const deliverable_entity_1 = require("../deliverables/entities/deliverable.entity");
const user_entity_1 = require("../users/entities/user.entity");
const notifications_module_1 = require("../notifications/notifications.module");
let TasksModule = class TasksModule {
};
exports.TasksModule = TasksModule;
exports.TasksModule = TasksModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([task_entity_1.Task, task_assignee_entity_1.TaskAssignee, task_file_history_entity_1.TaskFileHistory, task_question_entity_1.TaskQuestion, task_comment_entity_1.TaskComment, deliverable_entity_1.Deliverable, user_entity_1.User]),
            (0, common_1.forwardRef)(() => notifications_module_1.NotificationsModule),
        ],
        controllers: [tasks_controller_1.TasksController],
        providers: [tasks_service_1.TasksService],
        exports: [tasks_service_1.TasksService],
    })
], TasksModule);
//# sourceMappingURL=tasks.module.js.map