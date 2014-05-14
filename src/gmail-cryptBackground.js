/* This is the background page for gmail-crypt that communicates between gmail and the extension.
 *
 * Copyright 2011 Sean Colyer, <sean @ colyer . name>
 * This program is licensed under the GNU General Public License Version 2.
 * See included "LICENSE" file for details.
 */

var keyring;

//Grouping all alerts in one place, easy to access. Consider moving .html to a format function, since they are heavily pattern based.
var gCryptAlerts = {
  gCryptAlertDecryptNoMessage : {id: 'gCryptAlertDecryptNoMessage', type: 'error', text: 'No OpenPGP message was found.',
    html: '<div class="alert alert-error" id="gCryptAlertDecryptNoMessage">No OpenPGP message was found.</div>' },
  gCryptUnableVerifySignature: {id: 'gCryptUnableVerifySignature', type: '', text: 'Mymail-Crypt For Gmail was unable to verify this message.',
    html: '<div class="alert" id="gCryptUnableVerifySignature">Mymail-Crypt For Gmail was unable to verify this message.</div>' },
  gCryptAbleVerifySignature: {id: 'gCryptAbleVerifySignature', type: 'success', text: 'Mymail-Crypt For Gmail was able to verify this message.',
    html: '<div class="alert alert-success" id="gCryptUnableVerifySignature">Mymail-Crypt For Gmail was able to verify this message.</div>'},
  gCryptAlertPassword: {id: 'gCryptAlertPassword', type: 'error', text: 'Mymail-Crypt For Gmail was unable to read your key. Is your password correct?',
    html: '<div class="alert alert-error" id="gCryptAlertPassword">Mymail-Crypt For Gmail was unable to read your key. Is your password correct?</div>'},
  gCryptAlertDecrypt: {id: 'gCryptAlertDecrypt', type: 'error', text: 'Mymail-Crypt for Gmail was unable to decrypt this message.',
    html: '<div class="alert alert-error" id="gCryptAlertDecrypt">Mymail-Crypt for Gmail was unable to decrypt this message.</div>'},
  gCryptAlertEncryptNoUser: {id: 'gCryptAlertEncryptNoUser', type: 'error', text: 'Unable to find a key for the given user. Have you inserted their public key?',
    html: '<div class="alert alert-error" id="gCryptAlertEncryptNoUser">Unable to find a key for the given user. Have you inserted their public key?</div>'},
  gCryptAlertEncryptNoPrivateKeys: {id: 'gCryptAlertEncryptNoPrivateKeys', type: 'error', text: 'Unable to find a private key for the given user. Have you inserted yours in the Options page?',
    html: '<div class="alert alert-error" id="gCryptAlertEncryptNoUser">Unable to find a private key for the given user. Have you inserted yours in the Options page?</div>'}
};


function getOption(optionName) {
  var gCryptSettings = openpgp.config.thirdParty;
  if(!gCryptSettings || !gCryptSettings.config){
    return;
  }
  else{
    return gCryptSettings.config[optionName];
  }
}

function getKeys(keyIds, keyringSet) {
  var keys = [];
  keyIds.forEach(function(keyId){
    keys.push(keyringSet.getForId(keyId.toHex(), true));
  });
  return keys;
}

function prepareAndValidatePrivateKey(password) {
  var privKeys = keyring.privateKeys;
  for (var p = 0; p < privKeys.keys.length; p++) {
    var privKey = privKeys.keys[p];
    if (privKey.decrypt() || privKey.decrypt(password)) {
      return privKey;
    }
  }
  return gCryptAlerts.gCryptAlertEncryptNoPrivateKeys;
}

function prepareAndValidateKeysForRecipients(recipients) {
  if(recipients.email.length === 0){
    return gCryptAlert.gCryptAlertEncryptNoUser;
  }

  var emails = recipients.email;
  var keys = [];
  for(var email in emails){
    if(emails[email].length > 0){
      keys.push(keyring.publicKeys.getForAddress(emails[email])[0]);
    }
  }

  if(keys.length === 0){
    return gCryptAlerts.gCryptAlertEncryptNoUser;
  }

  var includeMyKey = getOption('includeMyself');
  if (includeMyKey) {
    var myKey = keyring.publicKeys.getFoId(request.myKeyId)[0];
    keys.push(myKey);
  }
  return keys;
}

function encryptAndSign(recipients, message, password) {
  debugger;
  var privKey = prepareAndValidatePrivateKey(password);
  if(privKey && privKey.type && privKey.type == "error") {
    return privKey;
  }
  var publicKeys = prepareAndValidateKeysForRecipients(recipients);
  if(publicKeys && publicKeys.type && publicKeys.type == "error") {
    return publicKeys;
  }
  var cipherText = openpgp.signAndEncryptMessage(publicKeys, privKey, message);
  return cipherText;
}

function encrypt(recipients, message) {
  var publicKeys = prepareAndValidateKeysForRecipients(recipients);
  if(publicKeys && publicKeys.type && publicKeys.type == "error") {
    return publicKeys;
  }
  var cipherText = openpgp.encryptMessage(publicKeys, message);
  return cipherText;
}

function sign(message, password) {
  var privKey = prepareAndValidatePrivateKey(password);
  if(privKey && privKey.type && privKey.type == "error") {
    return privKey;
  }
  var cipherText = openpgp.signClearMessage(privKey, message);
  return cipherText;
}

var decryptResult = function(decrypted, status, result) {
  output = {};
  output.decrypted = decrypted;
  output.status = status;
  output.result = result;
  return output;
};

function decrypt(senderEmail, msg, password) {
  var status = [];
  try{
    msg = openpgp.message.readArmored(msg);
  }
  catch (e) {
    status.push(gCryptAlerts.gCryptAlertDecryptNoMessage);
    return decryptResult(false, status);
  }
  var keyIds = msg.getEncryptionKeyIds();
  var privateKeys = getKeys(keyIds, keyring.privateKeys);
  var publicKeys = keyring.publicKeys.getForAddress(senderEmail);
  for (var r = 0; r < privateKeys.length; r++){
    var key = privateKeys[r];
    if (!key.decryptKeyPacket(keyIds, password)) {
      //TODO this could be generate false positive errors if we privateKeys really has multiple hits
      status.push(gCryptAlerts.gCryptAlertPassword);
    }

    try {
      var result = openpgp.decryptAndVerifyMessage(key, publicKeys, msg);
      for (var s = 0; s < result.signatures.length; s++) {
        if (result.signatures[s].valid) {
          status = [gCryptAlerts.gCryptAbleVerifySignature];
        }
      }
      if (status.length === 0) {
        status = [gCryptAlerts.gCryptUnableVerifySignature];
      }
      return decryptResult(true, status, result);
    }
    catch (e) {

    }
  }
  return decryptResult(false, status);
}

function verify(senderEmail, msg) {
  var status = [];
  try{
    msg = openpgp.message.readArmored(msg);
  }
  catch (e) {
    status.push(gCryptAlerts.gCryptAlertDecryptNoMessage);
    return decryptResult(false, status);
  }
  var publicKeys = keyring.publicKeys.getForAddress(senderEmail);
  try {
    var result = openpgp.verifyClearSignedMessage(publicKeys, msg);
    status.push(gCryptAlerts.gCryptAbleVerifySignature);
    return decryptResult(true, status, result);
  }
  catch (e) {
    return decryptResult(false, status);
  }
}

chrome.extension.onRequest.addListener(function(request,sender,sendResponse){
    var result;
    if (request.method == "encryptAndSign") {
      result = encryptAndSign(request.recipients, request.message, request.password);
      sendResponse(result);
    }
    else if (request.method == "encrypt") {
      result = encrypt(request.recipients, request.message);
      sendResponse(result);
    }
    else if (request.method == "sign") {
      result = sign(request.message, request.password);
      sendResponse(result);
    }
    else if (request.method == "decrypt") {
      result = decrypt(request.senderEmail, request.msg, request.password);
      sendResponse(result);
    }
    else if (request.method == "verify") {
      result = verify(request.senderEmail, request.msg);
    }
    else if(request.method == "getOption") {
      result = getOption(request.option);
      sendResponse(result);
    }
    else{
    }
});

function onLoad(){
  keyring = new openpgp.Keyring();
}

document.onload = onLoad();
