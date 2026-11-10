import * as securityRulesPkg from '@firebase/eslint-plugin-security-rules';

const flatRecommended =
  securityRulesPkg.flatRecommended || securityRulesPkg.default?.flatRecommended;

export default [flatRecommended];
