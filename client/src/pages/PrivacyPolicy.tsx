export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: January 15, 2026</p>
        
        <div className="space-y-6 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p>
              Meta Ads Uploader ("we", "our", or "us") is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, and safeguard your information 
              when you use our application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
            <p className="mb-2">We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Facebook Account Information:</strong> When you connect your Facebook account, we access your ad accounts, campaigns, ad sets, and ads data through the Meta Marketing API.</li>
              <li><strong>Authentication Data:</strong> We store your Facebook access token securely to maintain your session.</li>
              <li><strong>Media Files:</strong> Images and videos you upload for creating ads are temporarily stored and processed.</li>
              <li><strong>Usage Data:</strong> We may collect information about how you use our application.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p className="mb-2">We use the collected information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide and maintain our service</li>
              <li>Create and manage Facebook ads on your behalf</li>
              <li>Upload media to your Facebook ad account</li>
              <li>Display your campaigns, ad sets, and ads</li>
              <li>Improve our application</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Data Storage and Security</h2>
            <p>
              Your Facebook access token is stored securely in our database. Media files are 
              temporarily stored on secure cloud storage (Bunny.net CDN) and are used only for 
              the purpose of creating ads. We implement appropriate security measures to protect 
              your data against unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Third-Party Services</h2>
            <p className="mb-2">We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Meta (Facebook) Marketing API:</strong> To manage your Facebook ads</li>
              <li><strong>Bunny.net CDN:</strong> To store and deliver media files</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
            <p>
              We retain your data only for as long as necessary to provide our services. 
              You can request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights</h2>
            <p className="mb-2">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access your personal data</li>
              <li>Request correction of your data</li>
              <li>Request deletion of your data</li>
              <li>Disconnect your Facebook account at any time</li>
              <li>Revoke app permissions through Facebook settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Facebook Data Deletion</h2>
            <p>
              To delete your data from our application, you can disconnect your Facebook account 
              from within the app, or revoke access through your Facebook Settings → Apps and Websites. 
              Upon disconnection, we will delete your stored access token and associated data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any 
              changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at: 
              <a href="mailto:privacy@metaadsuploader.com" className="text-blue-600 hover:underline ml-1">
                privacy@metaadsuploader.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <a href="/" className="text-blue-600 hover:underline">← Back to Home</a>
        </div>
      </div>
    </div>
  );
}
