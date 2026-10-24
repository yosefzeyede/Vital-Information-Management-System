const authorizeRoles = (...allowedRoles) => {
  //rest parameter
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message:
          "Access denied. You do not have permission to perform this action.",
      });
    }

    next();
  };
};

module.exports = authorizeRoles;
