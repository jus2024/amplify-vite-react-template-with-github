import { useEffect, useState } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { signInWithRedirect } from "aws-amplify/auth";
import "@aws-amplify/ui-react/styles.css";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

function GitHubLoginButton() {
  const handleClick = () => {
    signInWithRedirect({ provider: { custom: "GitHub" } });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        width: "100%",
        padding: "0.75rem 1rem",
        marginTop: "1rem",
        backgroundColor: "#24292e",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        fontSize: "1rem",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      Login with GitHub
    </button>
  );
}

const authenticatorComponents = {
  SignIn: {
    Footer() {
      return <GitHubLoginButton />;
    },
  },
};

function App() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);

  useEffect(() => {
    client.models.Todo.observeQuery().subscribe({
      next: (data) => setTodos([...data.items]),
    });
  }, []);

  function createTodo() {
    client.models.Todo.create({ content: window.prompt("Todo content") });
  }

  return (
    <Authenticator components={authenticatorComponents}>
      {({ signOut }) => (
        <main>
          <h1>My todos</h1>
          <button onClick={createTodo}>+ new</button>
          <ul>
            {todos.map((todo) => (
              <li key={todo.id}>{todo.content}</li>
            ))}
          </ul>
          <div>
            🥳 App successfully hosted. Try creating a new todo.
            <br />
            <a href="https://docs.amplify.aws/react/start/quickstart/#make-frontend-updates">
              Review next step of this tutorial.
            </a>
          </div>
          <button onClick={signOut} style={{ marginTop: "1rem" }}>
            Sign out
          </button>
        </main>
      )}
    </Authenticator>
  );
}

export default App;