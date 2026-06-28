const Privacy = () => {
    return (
        <div className="max-w-2xl mx-auto py-6 space-y-6 font-serif">
            <h1 className="text-2xl font-cinzel font-semibold text-primary">Privacy Policy</h1>
            <p className="text-small text-default-500">Last updated: June 2025</p>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">Overview</h2>
                <p className="text-default-700">
                    The Citadel is a playtesting management tool for A Game of Thrones: The Card Game (LCG).
                    This policy explains what data we collect, how we use it, and how it is stored.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">Authentication</h2>
                <p className="text-default-700">
                    We use Discord OAuth2 to authenticate users. We do not store your Discord password.
                    When you log in, Discord grants us access using the following scopes:
                </p>
                <ul className="list-disc list-inside text-default-700 space-y-1 pl-2">
                    <li><strong>identify</strong> — your Discord user profile</li>
                    <li><strong>guilds</strong> — the list of servers you belong to</li>
                    <li><strong>guilds.members.read</strong> — your nickname and roles within our Discord server</li>
                </ul>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">Data We Collect</h2>
                <p className="text-default-700">
                    During login we collect and store the following information from Discord:
                </p>
                <ul className="list-disc list-inside text-default-700 space-y-1 pl-2">
                    <li>Discord user ID</li>
                    <li>Discord username</li>
                    <li>Display name (global name or server nickname)</li>
                    <li>Avatar URL</li>
                    <li>Discord roles within our server (used to determine your access level)</li>
                    <li>Timestamp of last login</li>
                </ul>
                <p className="text-default-700">
                    We do not collect your email address, phone number, or any other personal information.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">How We Use Your Data</h2>
                <ul className="list-disc list-inside text-default-700 space-y-1 pl-2">
                    <li>To authenticate you and maintain your session</li>
                    <li>To display your username and avatar within the site</li>
                    <li>To determine what features and content you have access to, based on your Discord roles</li>
                </ul>
                <p className="text-default-700">
                    We do not sell, share, or use your data for advertising or analytics purposes.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">Sessions &amp; Tokens</h2>
                <p className="text-default-700">
                    When you log in, we issue two tokens:
                </p>
                <ul className="list-disc list-inside text-default-700 space-y-1 pl-2">
                    <li>
                        <strong>Access token</strong> — a short-lived JWT stored in an HTTPOnly, Secure cookie.
                        It is not accessible to JavaScript and expires automatically.
                    </li>
                    <li>
                        <strong>Refresh token</strong> — a hashed token stored in our database, used to issue
                        new access tokens without requiring you to log in again. It expires after a set period
                        and is invalidated on logout.
                    </li>
                </ul>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">Data Retention</h2>
                <p className="text-default-700">
                    Your account data is retained for as long as your account is active. If you wish to have
                    your data removed, please contact an administrator via Discord.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-cinzel font-semibold">Third Parties</h2>
                <p className="text-default-700">
                    The only third-party service involved in authentication is Discord. We do not share
                    your data with any other third parties.
                </p>
            </section>
        </div>
    );
};

export default Privacy;
