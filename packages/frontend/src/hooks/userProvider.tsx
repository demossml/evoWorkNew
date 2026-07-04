import { createContext, type PropsWithChildren, useContext } from "react";
import { useMe, useEmployeeRole, useEmployeeNameAndUuid } from "./useApi";

type IUserContext = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  photo_url?: string;
};

const UserContext = createContext<IUserContext>(
  null as unknown as IUserContext
);

// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }: PropsWithChildren) => {
  const user = useMe();

  if (!user.data) return <h3>Loading...</h3>;

  // Обновляем объект, передаваемый в контекст, добавив photo_url
  const userData = {
    ...user.data,
    photo_url: user.data.photo_url || "", // Если поле photo_url отсутствует, передаем пустую строку
  };

  return (
    <UserContext.Provider value={userData}>{children}</UserContext.Provider>
  );
};

type IEmployeeRoleContext = {
  role: string;
};

const EmployeeRoleContext = createContext<IEmployeeRoleContext | undefined>(
  undefined
);

// Провайдер для роли сотрудника
export const EmployeeRoleProvider = ({ children }: PropsWithChildren) => {
  const { data, isLoading, isError, error } = useEmployeeRole();

  if (isLoading) return <h3>Loading...</h3>;
  if (isError) return <h3>Error: {error.message}</h3>;

  if (!data) {
    return <h3>No data available</h3>;
  }

  return (
    <EmployeeRoleContext.Provider value={{ role: data.employeeRole ?? "null" }}>
      {children}
    </EmployeeRoleContext.Provider>
  );
};

type IEmployeeUuidNameContext = Array<{
  uuid: string;
  name: string;
}>;

const EmployeeUuidNameContext = createContext<
  IEmployeeUuidNameContext | undefined
>(undefined);

export const EmployeeUuidNameProvider = ({ children }: PropsWithChildren) => {
  const { data, isLoading, isError, error } = useEmployeeNameAndUuid();

  if (isLoading) return <h3>Loading...</h3>;
  if (isError) return <h3>Error: {error.message}</h3>;

  if (!data || !data.employeeNameAndUuid) {
    return <h3>No data available</h3>;
  }

  return (
    <EmployeeUuidNameContext.Provider value={data.employeeNameAndUuid}>
      {children}
    </EmployeeUuidNameContext.Provider>
  );
};
