export class BaseService {
  protected name: string = "";
}

export class UserService extends BaseService {
  getUser(id: string) {
    return id;
  }
}

export class AdminService extends UserService {
  isAdmin() {
    return true;
  }
}
