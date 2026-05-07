// State machine. State is stored in ScriptProperties as JSON keyed by chat_id.
// Shape: { name: 'collecting_name', data: { ... } }

var STATES = {
  IDLE: 'idle',
  CHOOSING_QTY: 'choosing_qty',
  COLLECTING_NAME: 'collecting_name',
  COLLECTING_PHONE: 'collecting_phone',
  COLLECTING_ADDRESS: 'collecting_address',
  COLLECTING_COMMENT: 'collecting_comment',
  CONFIRMING_ORDER: 'confirming_order',
  AWAITING_PAYMENT: 'awaiting_payment',
  AWAITING_RECEIPT: 'awaiting_receipt',
  ADMIN_REJECT_REASON: 'admin_reject_reason'
};

function getState(chatId) {
  var raw = PropertiesService.getScriptProperties().getProperty('state_' + chatId);
  if (!raw) return { name: STATES.IDLE, data: {} };
  try { return JSON.parse(raw); } catch (e) { return { name: STATES.IDLE, data: {} }; }
}

function setState(chatId, name, data) {
  PropertiesService.getScriptProperties().setProperty(
    'state_' + chatId,
    JSON.stringify({ name: name, data: data || {} })
  );
}

function patchStateData(chatId, patch) {
  var s = getState(chatId);
  Object.keys(patch).forEach(function(k) { s.data[k] = patch[k]; });
  setState(chatId, s.name, s.data);
}

function clearState(chatId) {
  PropertiesService.getScriptProperties().deleteProperty('state_' + chatId);
}
