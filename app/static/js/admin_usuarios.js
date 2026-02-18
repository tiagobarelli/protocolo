/* admin_usuarios.js — ES5 only */

function toggleNovoForm() {
  var form = document.getElementById('formNovo');
  var isHidden = form.style.display === 'none' || form.style.display === '';
  closeAllEditRows();
  form.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    document.getElementById('novo_nome').focus();
  }
}

function toggleEditForm(id) {
  var row = document.getElementById('edit-' + id);
  var wasHidden = row.style.display === 'none' || row.style.display === '';
  closeAllEditRows();
  if (wasHidden) {
    row.style.display = 'table-row';
  }
}

function toggleSenhaForm(id) {
  var row = document.getElementById('senha-' + id);
  var wasHidden = row.style.display === 'none' || row.style.display === '';
  closeAllEditRows();
  if (wasHidden) {
    row.style.display = 'table-row';
  }
}

function closeAllEditRows() {
  var rows = document.querySelectorAll('.edit-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.display = 'none';
  }
  var formNovo = document.getElementById('formNovo');
  if (formNovo) {
    formNovo.style.display = 'none';
  }
}
