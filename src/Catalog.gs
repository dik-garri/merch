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
  return String(product.sizes || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function productPhotoBlob(product) {
  if (!product.drive_file_id) return null;
  try {
    return DriveApp.getFileById(product.drive_file_id).getBlob();
  } catch (e) {
    logEvent('error', 'photo_load', String(e), { product_id: product.id });
    return null;
  }
}

function sendProductCard(chatId, product) {
  var caption = '<b>' + escapeHtml(product.title) + '</b>\n' +
                (product.description ? escapeHtml(product.description) + '\n' : '') +
                '💰 ' + formatMoney(product.price);
  var blob = productPhotoBlob(product);
  if (blob) {
    return tgSendPhoto(chatId, blob, caption, { reply_markup: kbProductCard(product.id) });
  }
  return tgSendMessage(chatId, caption, { reply_markup: kbProductCard(product.id) });
}
