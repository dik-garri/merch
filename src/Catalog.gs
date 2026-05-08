function listCategories() {
  var rows = rowsAsObjects(getSheet('Categories'));
  return rows.sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); });
}

function listProducts(categoryId) {
  var rows = rowsAsObjects(getSheet('Products'));
  return rows.filter(function(p) {
    return String(p.category) === String(categoryId) &&
           (p.active === true || String(p.active).toUpperCase() === 'TRUE');
  });
}

function getProduct(productId) {
  var rows = rowsAsObjects(getSheet('Products'));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(productId)) return rows[i];
  }
  return null;
}

function productSizes(product) {
  return String(product.sizes || '')
    .split(',')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s && s !== '-'; });
}

function productPhotoIds(product) {
  return String(product.drive_file_id || '')
    .split(',')
    .map(function(s) { return s.trim(); })
    .filter(Boolean);
}

function productPhotoBlobs(product) {
  var blobs = [];
  productPhotoIds(product).forEach(function(id) {
    try {
      blobs.push(DriveApp.getFileById(id).getBlob());
    } catch (e) {
      logEvent('error', 'photo_load', String(e), { product_id: product.id, file_id: id });
    }
  });
  // Telegram media group limit is 10
  return blobs.slice(0, 10);
}

function sendProductCard(chatId, product) {
  var caption = '<b>' + escapeHtml(product.title) + '</b>\n' +
                (product.description ? escapeHtml(product.description) + '\n' : '') +
                '💰 ' + formatMoney(product.price);
  var blobs = productPhotoBlobs(product);
  if (blobs.length >= 2) {
    tgSendMediaGroup(chatId, blobs, caption);
    // Album doesn't support inline buttons — send selector as a follow-up message
    tgSendMessage(chatId, '👆 ' + escapeHtml(product.title), { reply_markup: kbProductCard(product.id) });
    return;
  }
  if (blobs.length === 1) {
    return tgSendPhoto(chatId, blobs[0], caption, { reply_markup: kbProductCard(product.id) });
  }
  return tgSendMessage(chatId, caption, { reply_markup: kbProductCard(product.id) });
}
