export type ActionCategory = 'reservation' | 'content' | 'pc' | 'query' | 'rule' | 'learning';
export interface ActionDefinition {
    name: string;
    category: ActionCategory;
    description: string;
    requiresValidation: boolean;
    handler: string;
}
export declare function getAction(name: string): ActionDefinition | undefined;
export declare function getAllActions(): ActionDefinition[];
export declare function actionRequiresValidation(name: string): boolean;
//# sourceMappingURL=registry.d.ts.map