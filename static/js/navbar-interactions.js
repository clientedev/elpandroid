document.addEventListener('DOMContentLoaded', function () {
  const notificationBell = document.getElementById('notificationBell');
  const notificationBellMobile = document.getElementById('notificationBellMobile');
  const notificationsDrawer = document.getElementById('notificationsDrawer');
  
  if (notificationsDrawer) {
    const bsOffcanvas = new bootstrap.Offcanvas(notificationsDrawer);
    
    if (notificationBell) {
      notificationBell.addEventListener('click', function(e) {
        e.preventDefault();
        bsOffcanvas.show();
      });
    }
    
    if (notificationBellMobile) {
      notificationBellMobile.addEventListener('click', function(e) {
        e.preventDefault();
        bsOffcanvas.show();
      });
    }
  }
});
